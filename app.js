import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

document.addEventListener('DOMContentLoaded', async () => {
    function getLocalDate(dateObj = new Date()) {
        return dateObj.getFullYear() + "-" + 
               String(dateObj.getMonth() + 1).padStart(2, '0') + "-" + 
               String(dateObj.getDate()).padStart(2, '0');
    }
    
    let combinedDueQueue = [];         
    let currentItem = null;    
    let isAnswerVisible = false;
    let recentCardTracker = []; 
    let hasUnsavedChanges = false;
    let currentUser = null;
    let availableDecks = [];
    let catalogueDecks = [];
    let selectedDecks = []; 
    let modalMode = 'add'; 
    let globalTotalCards = 0;
    let globalTotalDue = 0;
    let pendingSaves = []; 
    let deckToRename = null;

    const setupPage = document.getElementById('setup-page');
    const deckListContainer = document.getElementById('deck-list-container');
    const startLearningBtn = document.getElementById('start-learning-btn');
    const messageArea = document.getElementById('message-area');
    const browseCatalogueBtn = document.getElementById('browse-catalogue-btn');
    
    const authEmail = document.getElementById('auth-email');
    const authPassword = document.getElementById('auth-password');
    const authStatus = document.getElementById('auth-status');
    const authFeedback = document.getElementById('auth-feedback');
    const loginBtn = document.getElementById('login-btn');
    const signupBtn = document.getElementById('signup-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const syncBtn = document.getElementById('sync-btn');
    const cloudSyncStatus = document.getElementById('cloud-sync-status');
    
    const personalDbPanel = document.getElementById('personal-db-panel');
    const createDbName = document.getElementById('create-db-name');
    const createDbFile = document.getElementById('create-db-file');
    const createDbText = document.getElementById('create-db-text');
    const createDbFeedback = document.getElementById('create-db-feedback');
    const createDbBtn = document.getElementById('create-db-btn');

    const playerPage = document.getElementById('player-page');
    const backBtn = document.getElementById('back-btn');
    const deleteBtn = document.getElementById('delete-btn');
    const canvas = document.getElementById('flashcard-canvas');
    const ctx = canvas.getContext('2d');
    const showAnswerBtn = document.getElementById('show-answer-btn');
    
    const addGkBtn = document.getElementById('add-gk-btn');
    const editGkBtn = document.getElementById('edit-gk-btn');
    const loadMoreBtn = document.getElementById('load-more-btn');
    const mainControls = document.getElementById('main-controls');
    const feedbackBtns2 = document.getElementById('feedback-btns-2');
    
    const gkModal = document.getElementById('gk-modal');
    const modalTitle = document.getElementById('modal-title');
    const modalInput = document.getElementById('modal-input');
    const modalDeckSelectContainer = document.getElementById('modal-deck-select-container');
    const modalDeckSelect = document.getElementById('modal-deck-select');
    const btnModalSave = document.getElementById('btn-modal-save');
    const btnModalCancel = document.getElementById('btn-modal-cancel');
    
    const renameModal = document.getElementById('rename-modal');
    const renameInput = document.getElementById('rename-input');
    const btnRenameCancel = document.getElementById('btn-rename-cancel');
    const btnRenameSave = document.getElementById('btn-rename-save');

    function getTargetCanvasSize() {
        const isMobile = window.innerWidth <= 600;
        return isMobile ? { w: 480, h: 480 } : { w: 700, h: 350 };
    }
    function updateCanvasSize() {
        const target = getTargetCanvasSize();
        if (canvas.width !== target.w || canvas.height !== target.h) {
            canvas.width = target.w;
            canvas.height = target.h;
        }
    }
    function getThemeColors() {
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        return {
            isDark,
            q: isDark ? '#f8fafc' : '#2c3e50',
            a: isDark ? '#4ade80' : '#27ae60',
            hint: isDark ? '#94a3b8' : '#7f8c8d',
            divider: isDark ? '#334155' : '#dde4ec',
            cardBg: isDark ? '#1e293b' : '#fdfdfd'
        };
    }
    window.onThemeChanged = function() {
        if (playerPage.style.display === 'block') drawFlashcard();
    };
    window.addEventListener('resize', () => {
        const target = getTargetCanvasSize();
        if (canvas.width !== target.w || canvas.height !== target.h) {
            updateCanvasSize();
            if (playerPage.style.display === 'block') drawFlashcard();
        }
    });

    window.addEventListener('beforeunload', (e) => {
        if (hasUnsavedChanges || pendingSaves.length > 0) {
            e.preventDefault();
            e.returnValue = 'You have unsaved progress! Please wait or click Save Progress before leaving.';
        }
    });

    const CLOUD_CONFIGURED = !SUPABASE_URL.includes('YOUR_PROJECT') && !SUPABASE_PUBLISHABLE_KEY.includes('YOUR_SUPABASE');

    function setCloudStatus(text, type = 'info-message') {
        if (cloudSyncStatus) {
            cloudSyncStatus.textContent = text;
            cloudSyncStatus.className = type;
        }
    }
    function setAuthFeedback(text, type = 'info') {
        if (!authFeedback) return;
        authFeedback.textContent = text;
        authFeedback.style.color = type === 'error' ? '#c0392b' : (type === 'success' ? '#229954' : '#34495e');
    }

    function updateAuthUI() {
        const signedIn = !!currentUser;
        authStatus.textContent = signedIn ? `Signed in as ${currentUser.email}.` : 'Sign in or create an account to sync progress across PC and Mobile.';
        authStatus.className = signedIn ? 'success-message' : 'info-message';
        loginBtn.style.display = signedIn ? 'none' : 'inline-block';
        signupBtn.style.display = signedIn ? 'none' : 'inline-block';
        logoutBtn.style.display = signedIn ? 'inline-block' : 'none';
        authEmail.disabled = signedIn;
        authPassword.disabled = signedIn;
        
        personalDbPanel.style.display = signedIn ? 'block' : 'none';
        browseCatalogueBtn.style.display = signedIn ? 'inline-block' : 'none';
        
        if (!signedIn) {
            deckListContainer.innerHTML = '<p style="font-size:0.9em; color:var(--text-secondary);">Login to load datasets...</p>';
            startLearningBtn.disabled = true;
            startLearningBtn.textContent = 'Login and select databases';
        }
    }

    // --- CRITICAL FIX 1: Provide cardToCloudRow ---
    function cardToCloudRow(card) {
        return {
            id: card.id || crypto.randomUUID(),
            user_id: currentUser.id,
            deck_key: card.deck_key, 
            question: card.question,
            answer: card.answer,
            level: Number(card.level) || 0,
            score: Number(card.score) || 0,
            next_review: card.next_review || getLocalDate(),
            pass_streak: Number(card.pass_streak) || 0,
            new_consecutive: Number(card.new_consecutive) || 0
        };
    }

    async function fetchUserDecks() {
        if (!currentUser) return;
        try {
            const { data: userDecks, error: userError } = await supabase
                .from('user_decks')
                .select('deck_key, deck_name')
                .eq('user_id', currentUser.id);
            if (userError) throw userError;
            
            availableDecks = [];
            (userDecks || []).forEach(ud => {
                availableDecks.push({
                    id: ud.deck_key,
                    name: ud.deck_name,
                    file: 'personal', // It is authoritative in Supabase
                    isCustom: ud.deck_key.startsWith('custom:')
                });
            });
            renderDeckList();
        } catch (error) {
            deckListContainer.innerHTML = `<p style="color:#e74c3c;">Failed to load your databases: ${error.message}</p>`;
        }
    }

    browseCatalogueBtn.addEventListener('click', async () => {
        if (!currentUser) return;
        browseCatalogueBtn.disabled = true;
        browseCatalogueBtn.textContent = 'Loading Catalogue...';
        try {
            const response = await fetch('./data/decks.json', { cache: 'no-store' });
            if (!response.ok) throw new Error('Could not load data/decks.json');
            const manifest = await response.json();
            catalogueDecks = Array.isArray(manifest.decks) ? manifest.decks : [];
            
            const userDeckKeys = new Set(availableDecks.map(d => d.id));
            
            catalogueDecks.forEach(bd => {
                if (!userDeckKeys.has(bd.id)) {
                    availableDecks.push({
                        id: bd.id,
                        name: bd.name,
                        file: bd.file,
                        isCustom: false
                    });
                    userDeckKeys.add(bd.id);
                }
            });
            renderDeckList();
            browseCatalogueBtn.style.display = 'none';
        } catch (e) {
            alert(`Failed to load catalogue: ${e.message}`);
        } finally {
            browseCatalogueBtn.disabled = false;
            browseCatalogueBtn.textContent = 'Browse Built-in Databases';
        }
    });
    
    function renderDeckList() {
        deckListContainer.innerHTML = '';
        if (availableDecks.length === 0) {
            deckListContainer.innerHTML = '<p style="font-size:0.9em; color:var(--text-secondary);">No databases available. Create one or browse the catalogue.</p>';
            return;
        }
        
        const customDecks = availableDecks.filter(d => d.isCustom);
        const builtInDecksList = availableDecks.filter(d => !d.isCustom);
        
        function createDeckRow(deck) {
            const row = document.createElement('div');
            row.style.display = 'flex';
            row.style.alignItems = 'center';
            row.style.justifyContent = 'space-between';
            row.style.marginBottom = '8px';
            row.style.padding = '10px';
            row.style.border = '1px solid var(--border-color)';
            row.style.borderRadius = '8px';
            row.style.backgroundColor = 'var(--input-bg)';
            
            const leftDiv = document.createElement('div');
            leftDiv.style.display = 'flex';
            leftDiv.style.alignItems = 'center';
            
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = `chk-${deck.id}`;
            checkbox.value = deck.id;
            checkbox.dataset.name = deck.name;
            checkbox.dataset.file = deck.file;
            checkbox.style.cursor = 'pointer';
            checkbox.style.width = '18px';
            checkbox.style.height = '18px';
            
            // Re-check previously selected items
            if (selectedDecks.some(sd => sd.id === deck.id)) {
                checkbox.checked = true;
            }
            
            checkbox.addEventListener('change', updateStartButton);
            
            const label = document.createElement('label');
            label.htmlFor = `chk-${deck.id}`;
            label.textContent = deck.name;
            label.style.marginLeft = '10px';
            label.style.cursor = 'pointer';
            label.style.fontWeight = '500';
            label.style.color = 'var(--text-primary)';
            
            leftDiv.appendChild(checkbox);
            leftDiv.appendChild(label);
            
            if (deck.isCustom) {
                const editBtn = document.createElement('button');
                editBtn.className = 'db-action-btn';
                editBtn.innerHTML = '✏️';
                editBtn.title = 'Rename Database';
                editBtn.style.marginLeft = '8px';
                editBtn.onclick = (e) => {
                    e.preventDefault();
                    deckToRename = deck;
                    renameInput.value = deck.name;
                    renameModal.style.display = 'flex';
                };
                leftDiv.appendChild(editBtn);
                
                const delDbBtn = document.createElement('button');
                delDbBtn.className = 'db-action-btn';
                delDbBtn.innerHTML = '🗑️';
                delDbBtn.title = 'Delete Database';
                delDbBtn.style.marginLeft = '4px';
                delDbBtn.onclick = async (e) => {
                    e.preventDefault();
                    if (playerPage.style.display === 'block') {
                        alert("Cannot delete a database while a practice session is active. Please return to settings first.");
                        return;
                    }
                    if (confirm(`Are you sure you want to completely delete "${deck.name}" and ALL its flashcards? This cannot be undone.`)) {
                        try {
                            // CRITICAL FIX 4: Safe Sequential Deletion (Cards then Metadata)
                            const { error: e1 } = await supabase.from('user_flashcards').delete()
                                .eq('user_id', currentUser.id).eq('deck_key', deck.id);
                            if(e1) throw e1;
                            
                            const { error: e2 } = await supabase.from('user_decks').delete()
                                .eq('user_id', currentUser.id).eq('deck_key', deck.id);
                            if(e2) throw e2;
                            
                            alert("Database deleted successfully.");
                            // Remove from selected list to prevent issues
                            selectedDecks = selectedDecks.filter(sd => sd.id !== deck.id);
                            await fetchUserDecks();
                        } catch(err) {
                            alert(`Failed to delete database: ${err.message}`);
                        }
                    }
                };
                leftDiv.appendChild(delDbBtn);
            }
            
            const rightDiv = document.createElement('div');
            rightDiv.style.display = 'flex';
            rightDiv.style.alignItems = 'center';
            rightDiv.style.gap = '8px';
            
            const limitLabel = document.createElement('label');
            limitLabel.textContent = 'Hard Limit:';
            limitLabel.style.fontSize = '0.85em';
            limitLabel.style.color = 'var(--text-secondary)';
            
            const limitInput = document.createElement('input');
            limitInput.type = 'number';
            limitInput.id = `limit-${deck.id}`;
            const savedLimit = localStorage.getItem(`sfp_limit_${deck.id}`);
            limitInput.value = savedLimit ? savedLimit : '5';
            limitInput.min = '5';
            limitInput.max = '200';
            limitInput.style.width = '65px';
            limitInput.style.padding = '4px 8px';
            
            limitInput.addEventListener('change', (e) => {
                let val = parseInt(e.target.value);
                if (isNaN(val) || val < 5) val = 5;
                e.target.value = val;
                localStorage.setItem(`sfp_limit_${deck.id}`, val);
            });
            
            rightDiv.appendChild(limitLabel);
            rightDiv.appendChild(limitInput);
            
            row.appendChild(leftDiv);
            row.appendChild(rightDiv);
            return row;
        }

        if (customDecks.length > 0) {
            const h4 = document.createElement('h4');
            h4.textContent = "My Personal Databases";
            deckListContainer.appendChild(h4);
            customDecks.forEach(d => deckListContainer.appendChild(createDeckRow(d)));
        }
        
        if (builtInDecksList.length > 0) {
            const h4 = document.createElement('h4');
            h4.textContent = customDecks.length > 0 ? "Built-in / Imported Databases" : "Databases";
            deckListContainer.appendChild(h4);
            builtInDecksList.forEach(d => deckListContainer.appendChild(createDeckRow(d)));
        }
        
        updateStartButton();
    }
    
    function updateStartButton() {
        const checkboxes = deckListContainer.querySelectorAll('input[type="checkbox"]:checked');
        if (checkboxes.length > 0) {
            startLearningBtn.disabled = false;
            startLearningBtn.textContent = `Start Learning (${checkboxes.length} Selected) 🚀`;
        } else {
            startLearningBtn.disabled = true;
            startLearningBtn.textContent = 'Select at least one database';
        }
    }

    btnRenameCancel.onclick = () => {
        renameModal.style.display = 'none';
        deckToRename = null;
    };
    
    btnRenameSave.onclick = async () => {
        const newName = renameInput.value.trim();
        if (!newName || !deckToRename) return;
        try {
            const { error } = await supabase.from('user_decks')
                .update({ deck_name: newName })
                .eq('user_id', currentUser.id)
                .eq('deck_key', deckToRename.id);
            if (error) throw error;
            renameModal.style.display = 'none';
            
            // Update in selected list if present
            const inSelected = selectedDecks.find(sd => sd.id === deckToRename.id);
            if (inSelected) inSelected.name = newName;
            
            await fetchUserDecks(); // refresh list
        } catch(err) {
            alert(`Rename failed: ${err.message}`);
        }
    };

    function parseCreationText(text) {
        const todayStr = getLocalDate();
        const parsed = [];
        let errors = [];
        const lines = text.split(/\r?\n/);
        
        lines.forEach((line, index) => {
            const trimmed = line.trim();
            if (!trimmed) return;
            const parts = trimmed.split(/\s*>\s*/);
            if (parts.length < 2 || !parts[0].trim() || !parts[1].trim()) {
                errors.push(`Line ${index + 1}: Missing Question or Answer`);
                return;
            }
            parsed.push({
                id: crypto.randomUUID(),
                question: parts[0].trim(),
                answer: parts[1].trim(),
                level: (parts.length > 2 && !isNaN(parseInt(parts[2]))) ? parseInt(parts[2]) : 0,
                score: (parts.length > 3 && !isNaN(parseInt(parts[3]))) ? parseInt(parts[3]) : 0,
                next_review: (parts.length > 4 && parts[4].trim() !== '') ? parts[4].trim() : todayStr,
                pass_streak: (parts.length > 5 && !isNaN(parseInt(parts[5]))) ? parseInt(parts[5]) : 0,
                new_consecutive: (parts.length > 6 && !isNaN(parseInt(parts[6]))) ? parseInt(parts[6]) : 0
            });
        });
        return { parsed, errors };
    }

    createDbBtn.addEventListener('click', async () => {
        if (!currentUser) return;
        createDbFeedback.textContent = '';
        createDbFeedback.style.color = 'var(--text-body)';
        
        const dbName = createDbName.value.trim();
        if (!dbName) {
            createDbFeedback.textContent = "Please enter a database name.";
            createDbFeedback.style.color = '#e74c3c';
            return;
        }

        let rawText = createDbText.value;
        const file = createDbFile.files[0];
        
        if (!rawText.trim() && !file) {
            createDbFeedback.textContent = "Please upload a TXT file or paste content.";
            createDbFeedback.style.color = '#e74c3c';
            return;
        }

        createDbBtn.disabled = true;
        createDbBtn.textContent = 'Creating...';
        
        try {
            if (file) {
                rawText = await file.text();
            }
            
            const { parsed, errors } = parseCreationText(rawText);
            
            if (errors.length > 0) {
                const proceed = confirm(`Found ${errors.length} formatting errors.\nFirst error: ${errors[0]}\n\nDo you want to discard invalid lines and proceed with ${parsed.length} valid cards?`);
                if (!proceed) throw new Error("Creation aborted due to formatting errors.");
            }
            
            if (parsed.length === 0) {
                throw new Error("No valid flashcards found. Cannot create empty database.");
            }

            const newDeckKey = `custom:${crypto.randomUUID()}`;
            
            // CRITICAL FIX 2: Rollback Safe Creation
            const { error: e1 } = await supabase.from('user_decks').insert({
                user_id: currentUser.id,
                deck_key: newDeckKey,
                deck_name: dbName
            });
            if (e1) throw e1;
            
            const rows = parsed.map(c => {
                c.deck_key = newDeckKey;
                return cardToCloudRow(c);
            });
            
            let insertionSuccess = true;
            for (let i = 0; i < rows.length; i += 200) {
                const { error: e2 } = await supabase.from('user_flashcards').insert(rows.slice(i, i + 200));
                if (e2) {
                    insertionSuccess = false;
                    console.error("Insertion failed at batch", i, e2);
                    break;
                }
            }
            
            if (!insertionSuccess) {
                // Perform rollback if partial failure
                await supabase.from('user_flashcards').delete().eq('user_id', currentUser.id).eq('deck_key', newDeckKey);
                await supabase.from('user_decks').delete().eq('user_id', currentUser.id).eq('deck_key', newDeckKey);
                throw new Error("Failed to insert cards completely. Database creation rolled back.");
            }
            
            createDbName.value = '';
            createDbText.value = '';
            createDbFile.value = '';
            createDbFeedback.textContent = `Success! "${dbName}" created with ${parsed.length} cards.`;
            createDbFeedback.style.color = '#27ae60';
            
            await fetchUserDecks(); // Refreshes the list securely
            
        } catch (err) {
            createDbFeedback.textContent = err.message;
            createDbFeedback.style.color = '#e74c3c';
        } finally {
            createDbBtn.disabled = false;
            createDbBtn.textContent = 'Create Database';
        }
    });

    // --- CRITICAL FIX 3: Safe Built-in Import ---
    async function importDeckForUserIfNeeded(deck) {
        if (deck.file === 'personal') return; // Already authoritative in Supabase
        
        const { data: savedDeck, error: e1 } = await supabase
            .from('user_decks')
            .select('id')
            .eq('user_id', currentUser.id)
            .eq('deck_key', deck.id).maybeSingle();
            
        if (e1) throw e1;
        if (savedDeck) {
            deck.file = 'personal'; // Mark as authoritative to prevent future fetches
            return; 
        }
        
        const response = await fetch(deck.file, { cache: 'no-store' });
        if (!response.ok) throw new Error(`Could not fetch ${deck.file}`);
        const text = await response.text();
        const { parsed } = parseCreationText(text); 
        
        // Use upsert to handle concurrent metadata insertions gracefully
        const { error: e2 } = await supabase
            .from('user_decks')
            .upsert({ user_id: currentUser.id, deck_key: deck.id, deck_name: deck.name }, { onConflict: 'user_id,deck_key' });
        if (e2) throw e2;
        
        if (parsed.length > 0) {
            // Prevent duplicate insertions if metadata succeeded but cards partially failed previously
            const { data: existingCards, error: e3 } = await supabase
                .from('user_flashcards')
                .select('question')
                .eq('user_id', currentUser.id)
                .eq('deck_key', deck.id);
            if (e3) throw e3;
            
            const existingSet = new Set((existingCards || []).map(c => c.question));
            const newCards = parsed.filter(c => !existingSet.has(c.question));
            
            if (newCards.length > 0) {
                const rows = newCards.map(c => {
                    c.deck_key = deck.id;
                    return cardToCloudRow(c);
                });
                for (let i = 0; i < rows.length; i += 200) {
                    const { error: e4 } = await supabase.from('user_flashcards').insert(rows.slice(i, i + 200));
                    if (e4) throw e4;
                }
            }
        }
        deck.file = 'personal'; // Mark as authoritative
    }

    loginBtn.addEventListener('click', async () => {
        const email = authEmail.value.trim();
        const password = authPassword.value;
        if (!email || !password) return setAuthFeedback('Enter your email and password.', 'error');
        if (!CLOUD_CONFIGURED) return setAuthFeedback('Set your Supabase URL and publishable key in config.js first.', 'error');
        loginBtn.disabled = true;
        try {
            const { data, error } = await supabase.auth.signInWithPassword({ email, password });
            if (error) throw error;
            currentUser = data.user;
            updateAuthUI();
            await fetchUserDecks();
            setAuthFeedback('Login successful. Select databases.', 'success');
        } catch (error) {
            setAuthFeedback(error.message || 'Login failed.', 'error');
        } finally {
            loginBtn.disabled = false;
        }
    });

    signupBtn.addEventListener('click', async () => {
        const email = authEmail.value.trim();
        const password = authPassword.value;
        if (!email || !password) return setAuthFeedback('Enter your email and password.', 'error');
        if (password.length < 8) return setAuthFeedback('Use a password with at least 8 characters.', 'error');
        if (!CLOUD_CONFIGURED) return setAuthFeedback('Set your Supabase URL and publishable key in config.js first.', 'error');
        signupBtn.disabled = true;
        try {
            const { data, error } = await supabase.auth.signUp({ email, password });
            if (error) throw error;
            if (data.session && data.user) {
                currentUser = data.user;
                updateAuthUI();
                await fetchUserDecks();
                setAuthFeedback('Account created. Select databases.', 'success');
            } else {
                setAuthFeedback('Account created. Check your email to confirm, then log in.', 'success');
            }
        } catch (error) {
            setAuthFeedback(error.message || 'Account creation failed.', 'error');
        } finally {
            signupBtn.disabled = false;
        }
    });

    logoutBtn.addEventListener('click', async () => {
        await supabase.auth.signOut();
        currentUser = null;
        combinedDueQueue = [];
        selectedDecks = [];
        currentItem = null;
        globalTotalCards = 0;
        globalTotalDue = 0;
        updateAuthUI();
        setAuthFeedback('You have been logged out.', 'success');
        setCloudStatus('Sign in to sync your data.');
    });

    if (CLOUD_CONFIGURED) {
        supabase.auth.getSession().then(({ data }) => {
            currentUser = data?.session?.user || null;
            updateAuthUI();
            if (currentUser) {
                fetchUserDecks().catch(e => setAuthFeedback(e.message, 'error'));
            }
        });
        supabase.auth.onAuthStateChange((event, session) => {
            currentUser = session?.user || null;
            updateAuthUI();
        });
    }

    // --- Core SRS Generator (Per-Database) ---
    function generateChunkForDeck(dueCards, hardWordsLimit) {
        const todayStr = getLocalDate();
        const todayDate = new Date(todayStr);
        
        const newLimit = 5;
        const reviewLimit = (hardWordsLimit * 2) - 5;
        const totalTarget = hardWordsLimit + reviewLimit + newLimit;
        
        let newPool = [];
        let highLevelPool = [];
        let hardPool = [];
        
        dueCards.forEach(card => {
            if (card.level === 0 && card.score === 0) {
                newPool.push(card);
            } else if (card.level >= 2) {
                highLevelPool.push(card);
            } else {
                hardPool.push(card);
            }
        });
        
        const getOverdueDays = (reviewDateStr) => {
            const reviewDate = new Date(reviewDateStr);
            const diffTime = todayDate - reviewDate;
            return diffTime > 0 ? Math.floor(diffTime / (1000 * 60 * 60 * 24)) : 0;
        };
        
        const prioritySort = (a, b) => {
            const weightA = (getOverdueDays(a.next_review) * 2) - a.score;
            const weightB = (getOverdueDays(b.next_review) * 2) - b.score;
            return weightB - weightA;
        };
        
        hardPool.sort(prioritySort);
        highLevelPool.sort(prioritySort);
        newPool.sort(() => Math.random() - 0.5);
        
        let selectedHard = hardPool.slice(0, hardWordsLimit);
        let selectedReview = highLevelPool.slice(0, reviewLimit);
        let selectedNew = newPool.slice(0, newLimit);
        
        let currentSelectedTotal = selectedHard.length + selectedReview.length + selectedNew.length;
        let selectedFiller = [];
        
        if (currentSelectedTotal < totalTarget) {
            let remainingDue = [
                ...hardPool.slice(hardWordsLimit),
                ...highLevelPool.slice(reviewLimit),
                ...newPool.slice(newLimit)
            ];
            if (remainingDue.length > 0) {
                let shortfall = totalTarget - currentSelectedTotal;
                remainingDue.sort((a, b) => {
                    const fillerA = (getOverdueDays(a.next_review) * 2) + a.score;
                    const fillerB = (getOverdueDays(b.next_review) * 2) + b.score;
                    return fillerB - fillerA;
                });
                selectedFiller = remainingDue.slice(0, shortfall);
            }
        }
        
        selectedHard.forEach(card => card._shuffleWeight = (Math.random() * 0.7) - 0.5);
        selectedReview.forEach(card => card._shuffleWeight = (Math.random() * 0.8) - 0.4);
        selectedNew.forEach(card => card._shuffleWeight = (Math.random() * 0.9) - 0.5);
        selectedFiller.forEach(card => card._shuffleWeight = (Math.random() * 0.8) - 0.3);
        
        let finalQueue = [...selectedHard, ...selectedReview, ...selectedNew, ...selectedFiller];
        finalQueue.sort((a, b) => a._shuffleWeight - b._shuffleWeight);
        finalQueue.forEach(card => delete card._shuffleWeight);
        
        return finalQueue;
    }

    async function initializeCombinedSession() {
        if (!currentUser) return;
        
        const checkboxes = deckListContainer.querySelectorAll('input[type="checkbox"]:checked');
        selectedDecks = Array.from(checkboxes).map(chk => {
            const limitInput = document.getElementById(`limit-${chk.value}`);
            let parsedLimit = parseInt(limitInput.value);
            return {
                id: chk.value,
                name: chk.dataset.name,
                file: chk.dataset.file,
                hardWordsLimit: (!isNaN(parsedLimit) && parsedLimit >= 5) ? parsedLimit : 5
            };
        });
        
        if (selectedDecks.length === 0) return;
        
        startLearningBtn.disabled = true;
        updateMessage('Preparing databases...', 'info-message');
        setCloudStatus('Preparing databases...', 'info-message');
        
        try {
            for (const deck of selectedDecks) {
                await importDeckForUserIfNeeded(deck);
            }
            
            await buildNextChunk();
            
            setupPage.style.display = 'none';
            playerPage.style.display = 'block';
            drawFlashcard();
            
        } catch(error) {
            updateMessage(`Failed to initialize: ${error.message}`, 'error-message');
            setCloudStatus(`Init Failed: ${error.message}`, 'error-message');
            startLearningBtn.disabled = false;
        }
    }
    
    async function buildNextChunk() {
        if (pendingSaves.length > 0) {
            setCloudStatus('Waiting for pending saves to finish...', 'info-message');
            await Promise.all(pendingSaves);
        }
        
        setCloudStatus('Generating new chunks...', 'info-message');
        
        let tempDueQueue = [];
        let tempTotalCards = 0;
        let tempTotalDue = 0;
        let deckChunks = [];
        
        modalDeckSelect.innerHTML = '';
        const todayStr = getLocalDate();
        
        try {
            for (const deck of selectedDecks) {
                const opt = document.createElement('option');
                opt.value = deck.id;
                opt.textContent = deck.name;
                modalDeckSelect.appendChild(opt);
                
                const { count: totalCount, error: err1 } = await supabase.from('user_flashcards')
                    .select('id', { count: 'exact', head: true })
                    .eq('user_id', currentUser.id)
                    .eq('deck_key', deck.id);
                if (err1) throw err1;
                tempTotalCards += (totalCount || 0);
                
                const { count: dueCount, error: err2 } = await supabase.from('user_flashcards')
                    .select('id', { count: 'exact', head: true })
                    .eq('user_id', currentUser.id)
                    .eq('deck_key', deck.id)
                    .lte('next_review', todayStr);
                if (err2) throw err2;
                tempTotalDue += (dueCount || 0);

                let dueCards = [];
                let fetchLimit = 1000;
                let fetchOffset = 0;
                let hasMore = true;
                
                while (hasMore) {
                    const { data: pageCards, error: err3 } = await supabase.from('user_flashcards')
                        .select('id,deck_key,question,answer,level,score,next_review,pass_streak,new_consecutive')
                        .eq('user_id', currentUser.id)
                        .eq('deck_key', deck.id)
                        .lte('next_review', todayStr)
                        .order('next_review', { ascending: true }) 
                        .range(fetchOffset, fetchOffset + fetchLimit - 1);
                        
                    if (err3) throw err3;
                    if (pageCards && pageCards.length > 0) {
                        dueCards.push(...pageCards);
                        fetchOffset += fetchLimit;
                        if (pageCards.length < fetchLimit) hasMore = false;
                    } else {
                        hasMore = false;
                    }
                }
                
                if (dueCards.length > 0) {
                    const formattedCards = dueCards.map(c => ({
                        ...c,
                        level: Number(c.level) || 0,
                        score: Number(c.score) || 0,
                        pass_streak: Number(c.pass_streak) || 0,
                        new_consecutive: Number(c.new_consecutive) || 0
                    }));
                    const chunk = generateChunkForDeck(formattedCards, deck.hardWordsLimit);
                    deckChunks.push(chunk);
                }
            }
            
            let merged = [];
            let maxLength = deckChunks.reduce((max, chunk) => Math.max(max, chunk.length), 0);
            for (let i = 0; i < maxLength; i++) {
                for (const chunk of deckChunks) {
                    if (chunk[i]) {
                        merged.push(chunk[i]);
                    }
                }
            }
            tempDueQueue = merged;

            combinedDueQueue = tempDueQueue;
            globalTotalCards = tempTotalCards;
            globalTotalDue = tempTotalDue;
            
            recentCardTracker = [];
            hasUnsavedChanges = false;
            updateBoard();
            nextCard();
            setCloudStatus('Ready! Combined session active.', 'success-message');
            
        } catch (error) {
            console.error("Chunk Build Error:", error);
            throw error;
        }
    }

    startLearningBtn.addEventListener('click', initializeCombinedSession);
    
    loadMoreBtn.addEventListener('click', async () => {
        loadMoreBtn.style.display = 'none';
        try {
            await buildNextChunk();
        } catch (e) {
            setCloudStatus(`Failed to load chunk: ${e.message}`, 'error-message');
            loadMoreBtn.style.display = 'inline-block';
        }
    });

    backBtn.addEventListener('click', () => {
        playerPage.style.display = 'none';
        setupPage.style.display = 'block';
        updateStartButton(); 
        fetchUserDecks(); 
    });

    async function saveCardToCloud(card, quiet = false) {
        if (!currentUser || !card.deck_key || !card) return false;
        if (!card.id) card.id = crypto.randomUUID();
        const { error } = await supabase.from('user_flashcards')
            .upsert(cardToCloudRow(card), { onConflict: 'id' });
        if (error) {
            hasUnsavedChanges = true;
            if (!quiet) setCloudStatus(`Save failed: ${error.message}`, 'error-message');
            throw error;
        }
        hasUnsavedChanges = false;
        if (!quiet) setCloudStatus('Changes saved to cloud.', 'success-message');
        return true;
    }

    syncBtn.addEventListener('click', async () => {
        if (pendingSaves.length > 0) {
            syncBtn.disabled = true;
            syncBtn.textContent = 'Saving...';
            try {
                await Promise.all(pendingSaves);
                setCloudStatus('All pending changes saved to cloud.', 'success-message');
            } catch (e) {
                setCloudStatus('Error during cloud save.', 'error-message');
            } finally {
                syncBtn.disabled = false;
                syncBtn.textContent = 'Save to Cloud ☁️';
            }
        } else {
            setCloudStatus('No unsaved changes.', 'info-message');
        }
    });

    function parseModalText(text) {
        if (!text || !text.trim()) return null;
        const parts = text.split(/\s*>\s*/);
        if (parts.length < 2) return null;
        const q = parts[0].trim();
        const a = parts.slice(1).join(' > ').trim(); 
        if (!q || !a) return null;
        return { question: q, answer: a };
    }

    function openModal(mode, text = '') {
        modalMode = mode;
        modalTitle.textContent = mode === 'add' ? 'Add New GK ➕' : 'Edit GK ✏️';
        modalInput.value = text;
        modalDeckSelectContainer.style.display = mode === 'add' ? 'block' : 'none';
        gkModal.style.display = 'flex';
        modalInput.focus();
        
        if(mode === 'edit') {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            const theme = getThemeColors();
            ctx.fillStyle = theme.cardBg;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
    }

    addGkBtn.addEventListener('click', () => openModal('add'));
    editGkBtn.addEventListener('click', () => {
        if (!currentItem) return;
        openModal('edit', `${currentItem.question} > ${currentItem.answer}`);
    });

    btnModalCancel.addEventListener('click', () => {
        gkModal.style.display = 'none';
        if(modalMode === 'edit') drawFlashcard();
    });

    btnModalSave.addEventListener('click', () => {
        const parsedData = parseModalText(modalInput.value);
        if (!parsedData) {
            alert("ভুল ফরম্যাট অথবা খালি ইনপুট! অবশ্যই 'Question > Answer' ফরম্যাটে দিন।");
            return;
        }

        if (modalMode === 'add') {
            const todayStr = getLocalDate();
            const targetDeckKey = modalDeckSelect.value;
            const newCard = {
                id: crypto.randomUUID(),
                deck_key: targetDeckKey,
                question: parsedData.question,
                answer: parsedData.answer,
                level: 0,
                score: 0,
                next_review: todayStr,
                pass_streak: 0,
                new_consecutive: 0
            };

            const savePromise = saveCardToCloud(newCard, true);
            pendingSaves.push(savePromise);
            savePromise.finally(() => {
                pendingSaves = pendingSaves.filter(p => p !== savePromise);
            });

            combinedDueQueue.push(newCard);
            globalTotalCards++;
            globalTotalDue++;
            updateBoard();

            if (combinedDueQueue.length === 1 && !currentItem) {
                nextCard();
            }
        } 
        else if (modalMode === 'edit') {
            currentItem.question = parsedData.question;
            currentItem.answer = parsedData.answer;
            const savePromise = saveCardToCloud(currentItem, true);
            pendingSaves.push(savePromise);
            savePromise.finally(() => {
                pendingSaves = pendingSaves.filter(p => p !== savePromise);
            });
            drawFlashcard();
        }
        gkModal.style.display = 'none';
    });

    function calculateSRS(currentLevel, rating) {
        let newLevel = currentLevel;
        if (rating === 'fail') newLevel = 0;
        else if (rating === 'pass') newLevel = currentLevel + 1;

        let addDays = 0;
        if (newLevel === 0) addDays = 0;
        else if (newLevel === 1) addDays = 1;
        else if (newLevel === 2) addDays = 2;
        else if (newLevel === 3) addDays = 5;
        else if (newLevel === 4) addDays = 9;
        else if (newLevel === 5) addDays = 14;
        else addDays = 20;

        let nextDate = new Date();
        nextDate.setDate(nextDate.getDate() + addDays);
        return { level: newLevel, next_review: getLocalDate(nextDate) };
    }

    async function handleFeedback(rating) {
        if (!currentItem) return;

        hasUnsavedChanges = true; 
        
        if (currentItem.pass_streak === undefined) currentItem.pass_streak = 0;
        if (currentItem.new_consecutive === undefined) currentItem.new_consecutive = 0;

        let isPassed = (rating === 'pass');
        let isFailed = (rating === 'fail');

        const processedItem = combinedDueQueue.shift(); 
        let isNewCard = (currentItem.level === 0 && currentItem.score === 0);
        
        const S = parseInt(document.getElementById('streak-threshold').value) || 2;

        if (isNewCard) {
            if (isPassed) {
                currentItem.new_consecutive++; 
                if (currentItem.new_consecutive >= S) {
                    currentItem.score += 1; 
                    const srsResult = calculateSRS(currentItem.level, rating);
                    currentItem.level = srsResult.level;
                    currentItem.next_review = srsResult.next_review;
                    currentItem.new_consecutive = 0; 
                    globalTotalDue = Math.max(0, globalTotalDue - 1);
                } else {
                    const randS = Math.floor(Math.random() * S) + 1; 
                    const insertIndex = Math.min(7 + (2 * randS), combinedDueQueue.length);
                    combinedDueQueue.splice(insertIndex, 0, processedItem);
                }
            } else if (isFailed) {
                currentItem.new_consecutive = 0;
                const srsResult = calculateSRS(currentItem.level, rating);
                currentItem.level = srsResult.level; 
                currentItem.next_review = srsResult.next_review;
                let minWait = 4 + S;
                let maxWait = 6 + (2 * S);
                let insertIndex = Math.floor(Math.random() * (maxWait - minWait + 1)) + minWait;
                insertIndex = Math.min(insertIndex, combinedDueQueue.length);
                combinedDueQueue.splice(insertIndex, 0, processedItem);
            }
        } else {
            let points = 0;
            if (rating === 'fail') {
                points = (currentItem.level === 0) ? -1 : -2;
            }
            if (rating === 'pass') points = 1;

            if (isPassed) {
                if (currentItem.level === 0) {
                    currentItem.pass_streak++; 
                    if (currentItem.pass_streak >= S) {
                        currentItem.score += points;
                        const srsResult = calculateSRS(currentItem.level, rating);
                        currentItem.level = srsResult.level;
                        currentItem.next_review = srsResult.next_review;
                        currentItem.pass_streak = 0; 
                        globalTotalDue = Math.max(0, globalTotalDue - 1);
                    } else {
                        const randS = Math.floor(Math.random() * S) + 1; 
                        const insertIndex = Math.min(7 + (2 * randS), combinedDueQueue.length);
                        combinedDueQueue.splice(insertIndex, 0, processedItem);
                    }
                } else {
                    currentItem.score += points;
                    const srsResult = calculateSRS(currentItem.level, rating);
                    currentItem.level = srsResult.level;
                    currentItem.next_review = srsResult.next_review;
                    currentItem.pass_streak = 0; 
                    globalTotalDue = Math.max(0, globalTotalDue - 1);
                }
            } else if (isFailed) {
                currentItem.score += points;
                currentItem.pass_streak = 0;
                const srsResult = calculateSRS(currentItem.level, rating);
                currentItem.level = srsResult.level;
                currentItem.next_review = srsResult.next_review;
                let minWait = 4 + S;
                let maxWait = 6 + (2 * S);
                let insertIndex = Math.floor(Math.random() * (maxWait - minWait + 1)) + minWait;
                insertIndex = Math.min(insertIndex, combinedDueQueue.length);
                combinedDueQueue.splice(insertIndex, 0, processedItem);
            }
        }

        updateBoard();
        const changedCard = currentItem;
        nextCard(); 

        const savePromise = saveCardToCloud(changedCard, true);
        pendingSaves.push(savePromise);
        try {
            await savePromise;
        } catch(e) {
            console.error("Save failed for card", e);
        } finally {
            pendingSaves = pendingSaves.filter(p => p !== savePromise);
        }
    }

    deleteBtn.addEventListener('click', async () => {
        if (!currentItem) return;
        const isConfirmed = confirm(`Are you sure you want to permanently delete this card?\n\n"${currentItem.question}"`);
        if (isConfirmed) {
            const { error } = await supabase.from('user_flashcards').delete()
                .eq('id', currentItem.id).eq('user_id', currentUser.id).eq('deck_key', currentItem.deck_key);
            if (error) {
                setCloudStatus(`Delete failed: ${error.message}`, 'error-message');
                return;
            }
            combinedDueQueue = combinedDueQueue.filter(c => c.id !== currentItem.id);
            globalTotalCards = Math.max(0, globalTotalCards - 1);
            globalTotalDue = Math.max(0, globalTotalDue - 1);
            updateBoard();
            nextCard();
            setCloudStatus('Card deleted from cloud.', 'success-message');
        }
    });

    document.getElementById('btn-fail').onclick = () => handleFeedback('fail');
    document.getElementById('btn-pass').onclick = () => handleFeedback('pass');

    function nextCard() {
        try {
            if (combinedDueQueue.length === 0) {
                currentItem = null;
                isAnswerVisible = false;
                drawFlashcard();
                mainControls.style.display = globalTotalCards > 0 ? 'flex' : 'none';
                feedbackBtns2.style.display = 'none';
                showAnswerBtn.style.display = 'none'; 
                deleteBtn.style.display = 'none'; 
                
                if(globalTotalCards > 0) {
                    loadMoreBtn.style.display = 'inline-block';
                }
                return;
            }

            let nextIndex = 0;
            for (let i = 0; i < combinedDueQueue.length; i++) {
                if (!recentCardTracker.includes(combinedDueQueue[i].id)) {
                    nextIndex = i;
                    break;
                }
            }

            currentItem = combinedDueQueue.splice(nextIndex, 1)[0];
            combinedDueQueue.unshift(currentItem); 

            recentCardTracker.push(currentItem.id);
            if (recentCardTracker.length > 10) recentCardTracker.shift(); 
            
            showAnswerBtn.style.display = 'inline-block';
            deleteBtn.style.display = 'inline-block'; 
            loadMoreBtn.style.display = 'none';
            
            isAnswerVisible = false;
            drawFlashcard();
            
            mainControls.style.display = 'flex';
            feedbackBtns2.style.display = 'none';
        } catch(err) {
            console.error("Display Error:", err);
        }
    }

    showAnswerBtn.onclick = () => {
        if(!currentItem) return;
        isAnswerVisible = true;
        drawFlashcard();
        mainControls.style.display = 'none';
        feedbackBtns2.style.display = 'flex';
    };

    function wrapTextAutoFit(context, text, x, centerY, maxWidth, maxHeight, baseFontSize, fontWeight, color, minFontSize = 14) {
        let fontSize = baseFontSize;
        let lines = [];
        let lineHeight = Math.round(fontSize * 1.48);

        while (fontSize >= minFontSize) {
            context.font = `${fontWeight} ${fontSize}px 'Noto Sans Bengali', 'Poppins', sans-serif`;
            lineHeight = Math.round(fontSize * 1.48);
            const words = (text || "").toString().split(' ');
            lines = [];
            let currentLine = '';

            for (let i = 0; i < words.length; i++) {
                const testLine = currentLine ? (currentLine + ' ' + words[i]) : words[i];
                const metrics = context.measureText(testLine);
                if (metrics.width > maxWidth && currentLine) {
                    lines.push(currentLine);
                    currentLine = words[i];
                } else {
                    currentLine = testLine;
                }
            }
            if (currentLine) lines.push(currentLine);
            const totalHeight = lines.length * lineHeight;
            if (totalHeight <= maxHeight || fontSize <= minFontSize) break;
            fontSize -= 2;
        }

        context.font = `${fontWeight} ${fontSize}px 'Noto Sans Bengali', 'Poppins', sans-serif`;
        context.fillStyle = color;
        context.textAlign = 'center';
        context.textBaseline = 'middle';

        const totalHeight = lines.length * lineHeight;
        let currentY = centerY - (totalHeight / 2) + (lineHeight / 2);

        lines.forEach(line => {
            context.fillText(line, x, currentY);
            currentY += lineHeight;
        });
    }

    function drawFlashcard() {
        updateCanvasSize();
        const theme = getThemeColors();

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = theme.cardBg;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        if (!currentItem) {
            ctx.fillStyle = theme.q;
            ctx.font = `bold ${canvas.width > 500 ? '24px' : '20px'} 'Noto Sans Bengali', 'Poppins', sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = 'middle';
            ctx.fillText(globalTotalCards === 0 ? "Setup Required!" : "Session chunk complete!", canvas.width / 2, canvas.height / 2);
            return;
        }

        ctx.fillStyle = theme.hint;
        ctx.font = "13px 'Noto Sans Bengali', 'Poppins', sans-serif";
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";
        const deckName = selectedDecks.find(d => d.id === currentItem.deck_key)?.name || 'Unknown Deck';
        ctx.fillText(`Mode: Q ➔ A | Deck: ${deckName}`, 20, 26);

        const qText = currentItem.question;
        const aText = currentItem.answer;
        const isSquare = (canvas.width === canvas.height);
        const padX = isSquare ? 35 : 45;
        const maxTextW = canvas.width - (padX * 2);

        if (!isAnswerVisible) {
            const qBaseFont = isSquare ? 24 : 26;
            const qMaxH = canvas.height - 70;
            wrapTextAutoFit(ctx, qText, canvas.width / 2, canvas.height / 2, maxTextW, qMaxH, qBaseFont, "600", theme.q, 16);
        } else {
            const dividerY = isSquare ? Math.round(canvas.height * 0.42) : Math.round(canvas.height * 0.48);
            const qCenterY = (35 + dividerY) / 2;
            const qMaxH = dividerY - 45;
            const qBaseFont = isSquare ? 21 : 23;
            wrapTextAutoFit(ctx, qText, canvas.width / 2, qCenterY, maxTextW, qMaxH, qBaseFont, "600", theme.q, 15);

            ctx.beginPath();
            ctx.moveTo(35, dividerY);
            ctx.lineTo(canvas.width - 35, dividerY);
            ctx.strokeStyle = theme.divider;
            ctx.lineWidth = 1;
            ctx.stroke();

            const aCenterY = (dividerY + canvas.height) / 2;
            const aMaxH = canvas.height - dividerY - 30;
            const aBaseFont = isSquare ? 23 : 22;
            wrapTextAutoFit(ctx, aText, canvas.width / 2, aCenterY, maxTextW, aMaxH, aBaseFont, "500", theme.a, 14);
        }
    }

    function updateBoard() {
        document.getElementById('due-count').textContent = combinedDueQueue.length;
        document.getElementById('total-due').textContent = globalTotalDue; 
        document.getElementById('total-count').textContent = globalTotalCards; 
    }

    function updateMessage(txt, type) {
        if(messageArea) {
            messageArea.textContent = txt;
            messageArea.className = type;
        }
    }

    // --- CRITICAL FIX 5: Export Pagination ---
    document.getElementById('export-btn').onclick = async () => {
        const btn = document.getElementById('export-btn');
        if (selectedDecks.length === 0) return;
        btn.disabled = true;
        btn.textContent = 'Exporting...';
        
        try {
            for (const deck of selectedDecks) {
                let deckCards = [];
                let fetchLimit = 1000;
                let fetchOffset = 0;
                let hasMore = true;
                
                while(hasMore) {
                    const { data: pageCards, error } = await supabase.from('user_flashcards')
                        .select('*')
                        .eq('user_id', currentUser.id)
                        .eq('deck_key', deck.id)
                        .order('id', { ascending: true })
                        .range(fetchOffset, fetchOffset + fetchLimit - 1);
                        
                    if (error) throw error;
                    if (pageCards && pageCards.length > 0) {
                        deckCards.push(...pageCards);
                        fetchOffset += fetchLimit;
                        if (pageCards.length < fetchLimit) hasMore = false;
                    } else {
                        hasMore = false;
                    }
                }
                
                if (deckCards.length === 0) continue;
                
                const fileLines = deckCards.map(card => {
                    return `${card.question} > ${card.answer} > ${card.level} > ${card.score} > ${card.next_review} > ${card.pass_streak || 0} > ${card.new_consecutive || 0}`;
                });
                const content = fileLines.join('\n');
                const blob = new Blob([content], { type: 'text/plain;charset=utf-8;' });
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = deck.name.replace(/\s+/g, '_') + '_backup.txt';
                a.click();
                URL.revokeObjectURL(a.href);
            }
            alert(`Backups downloaded successfully.`);
        } catch (err) {
            alert(`Export failed: ${err.message}`);
        } finally {
            btn.disabled = false;
            btn.textContent = 'Download Backup 💾';
        }
    };

    const exportLowScoreBtn = document.getElementById('export-low-score-btn');
    if (exportLowScoreBtn) {
        exportLowScoreBtn.addEventListener('click', async () => {
            if (selectedDecks.length === 0) {
                alert("আগে Database (.txt) আপলোড/সিলেক্ট করুন!");
                return;
            }
            const value = Number(document.getElementById("export-max-score").value);
            if (Number.isNaN(value)) {
                alert("Invalid Score");
                return;
            }
            
            exportLowScoreBtn.disabled = true;
            let foundAny = false;
            
            try {
                for (const deck of selectedDecks) {
                    let targetCards = [];
                    let fetchLimit = 1000;
                    let fetchOffset = 0;
                    let hasMore = true;
                    
                    while(hasMore) {
                        const { data: pageCards, error } = await supabase.from('user_flashcards')
                            .select('question,answer')
                            .eq('user_id', currentUser.id)
                            .eq('deck_key', deck.id)
                            .lt('score', value)
                            .order('id', { ascending: true })
                            .range(fetchOffset, fetchOffset + fetchLimit - 1);
                            
                        if (error) throw error;
                        if (pageCards && pageCards.length > 0) {
                            targetCards.push(...pageCards);
                            fetchOffset += fetchLimit;
                            if (pageCards.length < fetchLimit) hasMore = false;
                        } else {
                            hasMore = false;
                        }
                    }
                    
                    if (targetCards.length === 0) continue;
                    
                    foundAny = true;
                    const fileLines = targetCards.map(card => `${card.question} > ${card.answer}`);
                    const content = fileLines.join('\n');
                    const blob = new Blob([content], { type: 'text/plain;charset=utf-8;' });
                    const a = document.createElement('a');
                    a.href = URL.createObjectURL(blob);
                    a.download = `${deck.name.replace(/\s+/g, '_')}_scoreBelow${value}.txt`;
                    a.click();
                    URL.revokeObjectURL(a.href);
                }
                if (!foundAny) {
                    alert(`আপনার ডাটাবেসে ${value} এর নিচে স্কোর থাকা কোনো কার্ড নেই।`);
                }
            } catch (err) {
                alert(`Export failed: ${err.message}`);
            } finally {
                exportLowScoreBtn.disabled = false;
            }
        });
    }

    document.addEventListener('keydown', (event) => {
        if (playerPage.style.display !== 'block') return;
        if (gkModal.style.display === 'flex' || renameModal.style.display === 'flex') return;
        if (event.repeat) return;

        if (event.code === 'AltRight') {
            event.preventDefault();
            if (currentItem && !isAnswerVisible) {
                showAnswerBtn.click();
            } 
            else if (currentItem && isAnswerVisible) {
                const failBtn = document.getElementById('btn-fail');
                if (failBtn.offsetParent !== null) failBtn.click();
            }
            return;
        }

        if (event.code === 'ControlRight') {
            event.preventDefault();
            if (!currentItem || (currentItem && !isAnswerVisible)) {
                document.getElementById('sync-btn').click();
            } 
            else if (currentItem && isAnswerVisible) {
                const passBtn = document.getElementById('btn-pass');
                if (passBtn.offsetParent !== null) passBtn.click();
            }
            return;
        }
    });

    updateCanvasSize();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const initTheme = getThemeColors();
    ctx.fillStyle = initTheme.cardBg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
});
