import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);


        document.addEventListener('DOMContentLoaded', async () => {
            // Helper function for local date
			function getLocalDate(dateObj = new Date()) {
				return dateObj.getFullYear() + "-" + 
					   String(dateObj.getMonth() + 1).padStart(2, '0') + "-" + 
					   String(dateObj.getDate()).padStart(2, '0');
			}
            // --- State Variables ---
            let flashcards = [];       
            let dueQueue = [];         
            let currentItem = null;    
            let isAnswerVisible = false;
            let currentDeckName = 'flashcards_database.txt';
            let recentCardTracker = []; 
            let hasUnsavedChanges = false;
            let currentUser = null;
            let currentDeckKey = null;
            let availableDecks = [];
            let modalMode = 'add'; // 'add' or 'edit'

            // --- DOM Elements ---
            const setupPage = document.getElementById('setup-page');
            const deckSelect = document.getElementById('deck-select');
            const startLearningBtn = document.getElementById('start-learning-btn');
            const messageArea = document.getElementById('message-area');
            const authEmail = document.getElementById('auth-email');
            const authPassword = document.getElementById('auth-password');
            const authStatus = document.getElementById('auth-status');
            const authFeedback = document.getElementById('auth-feedback');
            const loginBtn = document.getElementById('login-btn');
            const signupBtn = document.getElementById('signup-btn');
            const logoutBtn = document.getElementById('logout-btn');
            const syncBtn = document.getElementById('sync-btn');
            const cloudSyncStatus = document.getElementById('cloud-sync-status');

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
            
            // Modal Elements
            const gkModal = document.getElementById('gk-modal');
            const modalTitle = document.getElementById('modal-title');
            const modalInput = document.getElementById('modal-input');
            const btnModalSave = document.getElementById('btn-modal-save');
            const btnModalCancel = document.getElementById('btn-modal-cancel');
            const themeToggleBtn = document.getElementById('theme-toggle-btn');
            const setupThemeToggleBtn = document.getElementById('setup-theme-toggle-btn');

            // --- Canvas & Responsive Theme Config ---
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

            function applyTheme(themeName) {
                document.documentElement.setAttribute('data-theme', themeName);
                try { localStorage.setItem('sfp_theme', themeName); } catch(e) {}
                const isDark = themeName === 'dark';
                const icon = isDark ? '☀️' : '🌙';
                const title = isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode';
                if (themeToggleBtn) { themeToggleBtn.textContent = icon; themeToggleBtn.title = title; }
                if (setupThemeToggleBtn) { setupThemeToggleBtn.textContent = icon; setupThemeToggleBtn.title = title; }
                if (playerPage.style.display === 'block') {
                    drawFlashcard();
                }
            }

            function toggleTheme() {
                const current = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
                applyTheme(current === 'dark' ? 'light' : 'dark');
            }

            if (themeToggleBtn) themeToggleBtn.addEventListener('click', toggleTheme);
            if (setupThemeToggleBtn) setupThemeToggleBtn.addEventListener('click', toggleTheme);

            let initialTheme = 'light';
            try {
                initialTheme = localStorage.getItem('sfp_theme') || 
                    (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
            } catch(e) {}
            applyTheme(initialTheme);

            // Responsive Canvas Listener: purely visual redraw, never resets SRS progress or card queue
            window.addEventListener('resize', () => {
                const target = getTargetCanvasSize();
                if (canvas.width !== target.w || canvas.height !== target.h) {
                    updateCanvasSize();
                    if (playerPage.style.display === 'block') {
                        drawFlashcard();
                    }
                }
            });

            // Tab Close Warning
            window.addEventListener('beforeunload', (e) => {
                if (hasUnsavedChanges) {
                    e.preventDefault();
                    e.returnValue = 'You have unsaved progress! Please click Save Progress before leaving.';
                }
            });

            // --- 1. Cloud Authentication + Dataset Loading ---
            const CLOUD_CONFIGURED = !SUPABASE_URL.includes('YOUR_PROJECT') &&
                !SUPABASE_PUBLISHABLE_KEY.includes('YOUR_SUPABASE');

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
                authStatus.textContent = signedIn
                    ? `Signed in as ${currentUser.email}. Your progress is stored in the cloud.`
                    : 'Sign in or create an account to sync progress across PC and Mobile.';
                authStatus.className = signedIn ? 'success-message' : 'info-message';
                loginBtn.style.display = signedIn ? 'none' : 'inline-block';
                signupBtn.style.display = signedIn ? 'none' : 'inline-block';
                logoutBtn.style.display = signedIn ? 'inline-block' : 'none';
                authEmail.disabled = signedIn;
                authPassword.disabled = signedIn;
                deckSelect.disabled = !signedIn;
                if (!signedIn) {
                    deckSelect.innerHTML = '<option value="">Login to load datasets...</option>';
                    startLearningBtn.disabled = true;
                    startLearningBtn.textContent = 'Login and select a database';
                }
            }

            function parseDeckText(text) {
                const todayStr = getLocalDate();
                const parsed = [];
                text.split(/\r?\n/).forEach((line) => {
                    const trimmed = line.trim();
                    if (!trimmed) return;
                    const parts = trimmed.split(/\s*>\s*/);
                    if (parts.length < 2) return;
                    parsed.push({
                        id: crypto.randomUUID(),
                        question: parts[0],
                        answer: parts[1],
                        level: (parts.length > 2 && !isNaN(parseInt(parts[2]))) ? parseInt(parts[2]) : 0,
                        score: (parts.length > 3 && !isNaN(parseInt(parts[3]))) ? parseInt(parts[3]) : 0,
                        next_review: (parts.length > 4 && parts[4].trim() !== '') ? parts[4].trim() : todayStr,
                        pass_streak: (parts.length > 5 && !isNaN(parseInt(parts[5]))) ? parseInt(parts[5]) : 0,
                        new_consecutive: (parts.length > 6 && !isNaN(parseInt(parts[6]))) ? parseInt(parts[6]) : 0
                    });
                });
                return parsed;
            }

            function cardToCloudRow(card) {
                return {
                    id: card.id || crypto.randomUUID(),
                    user_id: currentUser.id,
                    deck_key: currentDeckKey,
                    question: card.question,
                    answer: card.answer,
                    level: Number(card.level) || 0,
                    score: Number(card.score) || 0,
                    next_review: card.next_review || getLocalDate(),
                    pass_streak: Number(card.pass_streak) || 0,
                    new_consecutive: Number(card.new_consecutive) || 0
                };
            }

            async function loadDeckManifest() {
                const response = await fetch('./data/decks.json', { cache: 'no-store' });
                if (!response.ok) throw new Error('Could not load data/decks.json');
                const manifest = await response.json();
                availableDecks = Array.isArray(manifest.decks) ? manifest.decks : [];
                deckSelect.innerHTML = '<option value="">Choose a database...</option>';
                availableDecks.forEach(deck => {
                    const option = document.createElement('option');
                    option.value = deck.id;
                    option.textContent = deck.name;
                    deckSelect.appendChild(option);
                });
                if (availableDecks.length === 0) {
                    deckSelect.innerHTML = '<option value="">Add datasets in data/decks.json</option>';
                }
            }

            async function importDeckForUser(deck) {
                const response = await fetch(deck.file, { cache: 'no-store' });
                if (!response.ok) throw new Error(`Could not fetch ${deck.file}`);
                const text = await response.text();
                const importedCards = parseDeckText(text);

                const { error: deckInsertError } = await supabase
                    .from('user_decks')
                    .insert({ user_id: currentUser.id, deck_key: deck.id, deck_name: deck.name });

                // Another signed-in device may have completed the first import at the same time.
                if (deckInsertError && deckInsertError.code !== '23505') throw deckInsertError;
                if (deckInsertError && deckInsertError.code === '23505') return null;

                if (importedCards.length > 0) {
                    const rows = importedCards.map(card => cardToCloudRow(card));
                    for (let i = 0; i < rows.length; i += 200) {
                        const { error } = await supabase.from('user_flashcards').insert(rows.slice(i, i + 200));
                        if (error) {
                            await supabase.from('user_flashcards').delete()
                                .eq('user_id', currentUser.id).eq('deck_key', deck.id);
                            await supabase.from('user_decks').delete()
                                .eq('user_id', currentUser.id).eq('deck_key', deck.id);
                            throw error;
                        }
                    }
                }
                return importedCards;
            }

            async function loadSelectedDeck(deckKey) {
                if (!currentUser) throw new Error('Please sign in first.');
                const deck = availableDecks.find(item => item.id === deckKey);
                if (!deck) throw new Error('Please select a valid dataset.');

                // Set the active deck before importing so every inserted row gets the correct deck_key.
                currentDeckKey = deck.id;
                currentDeckName = deck.file.split('/').pop() || `${deck.id}.txt`;
                flashcards = [];
                dueQueue = [];
                currentItem = null;
                recentCardTracker = [];

                startLearningBtn.disabled = true;
                updateMessage('Loading dataset from cloud...', 'info-message');
                setCloudStatus(`Loading ${deck.name}...`);

                const { data: savedDeck, error: savedDeckError } = await supabase
                    .from('user_decks').select('id')
                    .eq('user_id', currentUser.id).eq('deck_key', deck.id).maybeSingle();
                if (savedDeckError) throw savedDeckError;

                if (!savedDeck) {
                    const imported = await importDeckForUser(deck);
                    if (imported !== null) {
                        flashcards = imported;
                    } else {
                        // First import was completed on another device; read the cloud copy below.
                        flashcards = [];
                    }
                }

                if (!flashcards.length) {
                    const { data, error } = await supabase.from('user_flashcards')
                        .select('id,question,answer,level,score,next_review,pass_streak,new_consecutive')
                        .eq('user_id', currentUser.id).eq('deck_key', deck.id)
                        .order('created_at', { ascending: true });
                    if (error) throw error;
                    flashcards = (data || []).map(card => ({
                        ...card,
                        level: Number(card.level) || 0,
                        score: Number(card.score) || 0,
                        pass_streak: Number(card.pass_streak) || 0,
                        new_consecutive: Number(card.new_consecutive) || 0
                    }));
                }

                hasUnsavedChanges = false;
                updateBoard();
                updateMessage(`Success! Loaded ${flashcards.length} cards from ${deck.name}. Ready to Start.`, 'success-message');
                setCloudStatus(`${deck.name} loaded. Cloud sync is active.`, 'success-message');
                startLearningBtn.disabled = false;
                startLearningBtn.textContent = 'Start Learning 🚀';
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
                    await loadDeckManifest();
                    setAuthFeedback('Login successful. Choose a dataset.', 'success');
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
                        await loadDeckManifest();
                        setAuthFeedback('Account created. Choose a dataset.', 'success');
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
                const { error } = await supabase.auth.signOut();
                if (error) return setAuthFeedback(error.message, 'error');
                currentUser = null;
                currentDeckKey = null;
                flashcards = [];
                dueQueue = [];
                currentItem = null;
                updateAuthUI();
                setAuthFeedback('You have been logged out.', 'success');
                setCloudStatus('Sign in to sync your data.');
            });

            deckSelect.addEventListener('change', async (event) => {
                const deckKey = event.target.value;
                if (!deckKey) return;
                try {
                    await loadSelectedDeck(deckKey);
                } catch (error) {
                    updateMessage(`Error loading dataset: ${error.message}`, 'error-message');
                    setCloudStatus(`Cloud load failed: ${error.message}`, 'error-message');
                    startLearningBtn.disabled = true;
                }
            });

            async function saveCardToCloud(card, quiet = false) {
                if (!currentUser || !currentDeckKey || !card) return false;
                if (!card.id) card.id = crypto.randomUUID();
                const { error } = await supabase.from('user_flashcards')
                    .upsert(cardToCloudRow(card), { onConflict: 'id' });
                if (error) {
                    hasUnsavedChanges = true;
                    setCloudStatus(`Save failed: ${error.message}`, 'error-message');
                    return false;
                }
                hasUnsavedChanges = false;
                if (!quiet) setCloudStatus('Changes saved to cloud.', 'success-message');
                return true;
            }

            async function saveAllToCloud() {
                if (!currentUser || !currentDeckKey) {
                    setCloudStatus('Sign in and select a dataset first.', 'error-message');
                    return;
                }
                syncBtn.disabled = true;
                setCloudStatus('Saving all cards to cloud...');
                try {
                    const rows = flashcards.map(card => cardToCloudRow(card));
                    for (let i = 0; i < rows.length; i += 200) {
                        const { error } = await supabase.from('user_flashcards')
                            .upsert(rows.slice(i, i + 200), { onConflict: 'id' });
                        if (error) throw error;
                    }
                    hasUnsavedChanges = false;
                    setCloudStatus(`Cloud save complete: ${rows.length} cards saved.`, 'success-message');
                } catch (error) {
                    hasUnsavedChanges = true;
                    setCloudStatus(`Cloud save failed: ${error.message}`, 'error-message');
                } finally {
                    syncBtn.disabled = false;
                }
            }

            syncBtn.addEventListener('click', saveAllToCloud);

            // Restore an existing session after refresh.
            if (CLOUD_CONFIGURED) {
                const { data: sessionData } = await supabase.auth.getSession();
                currentUser = sessionData?.session?.user || null;
                updateAuthUI();
                if (currentUser) {
                    try {
                        await loadDeckManifest();
                        setAuthFeedback('Session restored. Choose a dataset.', 'success');
                    } catch (error) {
                        setAuthFeedback(`Could not load dataset list: ${error.message}`, 'error');
                    }
                }
                supabase.auth.onAuthStateChange((event, session) => {
                    currentUser = session?.user || null;
                    updateAuthUI();
                });
            } else {
                updateAuthUI();
                setAuthFeedback('Setup required: add your Supabase project URL and publishable key to config.js.', 'error');
            }

            // --- PAGE NAVIGATION LOGIC ---
            startLearningBtn.addEventListener('click', () => {
                buildDueQueue();
                setupPage.style.display = 'none';
                playerPage.style.display = 'block';
                drawFlashcard();
            });

            backBtn.addEventListener('click', () => {
                playerPage.style.display = 'none';
                setupPage.style.display = 'block';
            });

            // --- SINGLE REUSABLE MODAL PARSER ---
            function parseModalText(text) {
                if (!text || !text.trim()) return null;
                const parts = text.split(/\s*>\s*/);
                
                if (parts.length < 2) return null;

                const q = parts[0].trim();
                // Join back everything else to support > inside the answer
                const a = parts.slice(1).join(' > ').trim(); 

                if (!q || !a) return null; // Empty check validation

                return { question: q, answer: a };
            }

            // --- Add/Edit Button Modals ---
            function openModal(mode, text = '') {
                modalMode = mode;
                modalTitle.textContent = mode === 'add' ? 'Add New GK ➕' : 'Edit GK ✏️';
                modalInput.value = text;
                gkModal.style.display = 'flex';
                modalInput.focus();
                
                // Hide card while editing for UX focus
                if(mode === 'edit') {
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                    const theme = getThemeColors();
                    ctx.fillStyle = theme.cardBg;
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                }
            }

            addGkBtn.addEventListener('click', () => {
                openModal('add');
            });

            editGkBtn.addEventListener('click', () => {
                if (!currentItem) return;
                openModal('edit', `${currentItem.question} > ${currentItem.answer}`);
            });

            btnModalCancel.addEventListener('click', () => {
                gkModal.style.display = 'none';
                if(modalMode === 'edit') drawFlashcard(); // redraw if cancelled
            });

            btnModalSave.addEventListener('click', () => {
                const parsedData = parseModalText(modalInput.value);
                
                if (!parsedData) {
                    alert("ভুল ফরম্যাট অথবা খালি ইনপুট! অবশ্যই 'Question > Answer' ফরম্যাটে দিন।");
                    return;
                }

                if (modalMode === 'add') {
                    const todayStr = getLocalDate();
                    const newCard = {
                        id: crypto.randomUUID(),
                        question: parsedData.question,
                        answer: parsedData.answer,
                        level: 0,
                        score: 0,
                        next_review: todayStr,
                        pass_streak: 0,
                        new_consecutive: 0
                    };

                    flashcards.push(newCard);
                    saveCardToCloud(newCard);
                    dueQueue.push(newCard);
                    hasUnsavedChanges = true;

                    const totalDueEl = document.getElementById('total-due');
                    totalDueEl.textContent = parseInt(totalDueEl.textContent) + 1;
                    updateBoard();

                    if (dueQueue.length === 1 && !currentItem) {
                        nextCard();
                    }
                   // alert("New GK added successfully!");
                } 
                else if (modalMode === 'edit') {
                    currentItem.question = parsedData.question;
                    currentItem.answer = parsedData.answer;
                    hasUnsavedChanges = true;
                    saveCardToCloud(currentItem);
                    
                    updateBoard();
                    drawFlashcard();
                }

                gkModal.style.display = 'none';
            });


            // --- 2. Build Daily Queue --- (Original Logic)
            function buildDueQueue() {
                try {
                    const todayStr = getLocalDate();
                    const todayDate = new Date(todayStr);
                    
                    const hardWordsInput = document.getElementById('hard-words-count');
                    let hardWordsLimit = hardWordsInput ? parseInt(hardWordsInput.value) : 20;
                    hardWordsLimit = isNaN(hardWordsLimit) ? 20 : hardWordsLimit;
                    
                    // --- STEP 1: Quota Allocation ---
                    const newLimit = 5;
                    const reviewLimit = (hardWordsLimit * 2) - 5;
                    const totalTarget = hardWordsLimit + reviewLimit + newLimit;

                    // --- STEP 2: Pool Categorization ---
                    let newPool = [];
                    let highLevelPool = [];
                    let hardPool = [];

                    flashcards.forEach(card => {
                        if (card.next_review <= todayStr) {
                            if (card.level === 0 && card.score === 0) {
                                newPool.push(card);
                            } else if (card.level >= 2) {
                                highLevelPool.push(card);
                            } else {
                                hardPool.push(card);
                            }
                        }
                    });

                    const totalDueToday = newPool.length + highLevelPool.length + hardPool.length;

                    // Helper: Calculate overdue days
                    const getOverdueDays = (reviewDateStr) => {
                        const reviewDate = new Date(reviewDateStr);
                        const diffTime = todayDate - reviewDate;
                        return diffTime > 0 ? Math.floor(diffTime / (1000 * 60 * 60 * 24)) : 0;
                    };

                    // --- STEP 3: Weighted Priority ---
                    const prioritySort = (a, b) => {
                        const weightA = (getOverdueDays(a.next_review) * 2) - a.score;
                        const weightB = (getOverdueDays(b.next_review) * 2) - b.score;
                        return weightB - weightA; // Sort descending (Highest weight first)
                    };

                    hardPool.sort(prioritySort);
                    highLevelPool.sort(prioritySort);
                    newPool.sort(() => Math.random() - 0.5); // Randomize New words

                    // Slice targets based on allocations
                    let selectedHard = hardPool.slice(0, hardWordsLimit);
                    let selectedReview = highLevelPool.slice(0, reviewLimit);
                    let selectedNew = newPool.slice(0, newLimit);

                    // --- STEP 4: Shortfall Compensation ---
                    let currentSelectedTotal = selectedHard.length + selectedReview.length + selectedNew.length;
                    let selectedFiller = [];

                    if (currentSelectedTotal < totalTarget) {
                        // Gather unselected cards
                        let remainingDue = [
                            ...hardPool.slice(hardWordsLimit),
                            ...highLevelPool.slice(reviewLimit),
                            ...newPool.slice(newLimit)
                        ];

                        if (remainingDue.length > 0) {
                            let shortfall = totalTarget - currentSelectedTotal;
                            
                            // Sort remaining pool using Filler weight equation
                            remainingDue.sort((a, b) => {
                                const fillerA = (getOverdueDays(a.next_review) * 2) + a.score;
                                const fillerB = (getOverdueDays(b.next_review) * 2) + b.score;
                                return fillerB - fillerA; // Descending
                            });
                            
                            selectedFiller = remainingDue.slice(0, shortfall);
                        }
                    }

                    // --- STEP 5: Biased Interleaving ---
                    selectedHard.forEach(card => card._shuffleWeight = (Math.random() * 0.7) - 0.5);   // [-0.5 to 0.2]
                    selectedReview.forEach(card => card._shuffleWeight = (Math.random() * 0.8) - 0.4); // [-0.4 to 0.4]
                    selectedNew.forEach(card => card._shuffleWeight = (Math.random() * 0.9) - 0.5);    // [-0.5 to 0.4]
                    selectedFiller.forEach(card => card._shuffleWeight = (Math.random() * 0.8) - 0.3); // [-0.3 to 0.5]

                    let finalQueue = [...selectedHard, ...selectedReview, ...selectedNew, ...selectedFiller];
                    
                    // Sort final queue by the randomized, biased constraints
                    finalQueue.sort((a, b) => a._shuffleWeight - b._shuffleWeight);

                    // Clean up temporary property
                    finalQueue.forEach(card => delete card._shuffleWeight);

                    dueQueue = finalQueue;
                    
                    // Update UI Boards
                    document.getElementById('total-due').textContent = totalDueToday;
                    updateBoard();
                    nextCard();
                    
                } catch(err) {
                    console.error("Queue Build Error:", err);
                }
            }

            loadMoreBtn.addEventListener('click', () => {
                buildDueQueue();
                loadMoreBtn.style.display = 'none';
            });

            // --- 3. Combined SRS Leitner Algorithm --- (Original Logic)
            function calculateSRS(currentLevel, rating) {
                let newLevel = currentLevel;
                
                // 2-Button Logic
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

            // --- 4. Handle Feedback & Scoring --- (Original Logic + New Card Rule)
            function handleFeedback(rating) {
                if (!currentItem) return;

                hasUnsavedChanges = true; 
                
                if (currentItem.pass_streak === undefined) {
                    currentItem.pass_streak = 0;
                }
                if (currentItem.new_consecutive === undefined) {
                    currentItem.new_consecutive = 0;
                }

                let isPassed = (rating === 'pass');
                let isFailed = (rating === 'fail');

                const processedItem = dueQueue.shift(); 
                let isNewCard = (currentItem.level === 0 && currentItem.score === 0);

                if (isNewCard) {
                    // --- NEW CARD SPECIAL PROGRESSION ---
                    if (isPassed) {
                        currentItem.new_consecutive++; 

                        const newCardPassTarget = parseInt(document.getElementById('streak-threshold').value) || 2;
                        if (currentItem.new_consecutive >= newCardPassTarget) {
                            currentItem.score += 1; 

                            const srsResult = calculateSRS(currentItem.level, rating);
                            currentItem.level = srsResult.level;
                            currentItem.next_review = srsResult.next_review;
                            
                            currentItem.new_consecutive = 0; 

                            const totalDueEl = document.getElementById('total-due');
                            let currentTotal = parseInt(totalDueEl.textContent);
                            totalDueEl.textContent = Math.max(0, currentTotal - 1);
                        } else {
                            const S = parseInt(document.getElementById('streak-threshold').value) || 2;
                            const randS = Math.floor(Math.random() * S) + 1; 
                            const insertIndex = Math.min(7 + (2 * randS), dueQueue.length);
                            dueQueue.splice(insertIndex, 0, processedItem);
                        }
                    } else if (isFailed) {
                        currentItem.new_consecutive = 0;
                        // For new cards only, Fail must NOT reduce score: no -2 or any negative score.
                        
                        const srsResult = calculateSRS(currentItem.level, rating);
                        currentItem.level = srsResult.level; 
                        currentItem.next_review = srsResult.next_review;

                        const S = parseInt(document.getElementById('streak-threshold').value) || 2; 
                        let minWait = 4 + S;
                        let maxWait = 6 + (2 * S);
                        let insertIndex = Math.floor(Math.random() * (maxWait - minWait + 1)) + minWait;
                        
                        insertIndex = Math.min(insertIndex, dueQueue.length);
                        dueQueue.splice(insertIndex, 0, processedItem);
                    }
                } else {
                    // --- EXISTING NORMAL/MANUAL STREAK LOGIC ---
                    let points = 0;
                    if (rating === 'fail') {
                        if (currentItem.level === 0) {
                            points = -1;
                        } else {
                            points = -2;
                        }
                    }
                    if (rating === 'pass') points = 1;

                    if (isPassed) {
                        if (currentItem.level === 0) {
                            currentItem.pass_streak++; 

                            // শুধুমাত্র ২য় বার (বা তার বেশি) পাস করলেই পয়েন্ট যোগ হবে এবং লেভেল আপগ্রেড হবে
                            const streakThreshold = parseInt(document.getElementById('streak-threshold').value) || 2;
                            if (currentItem.pass_streak >= streakThreshold) {
                                currentItem.score += points; // ২য় পাসে পয়েন্ট যোগ হচ্ছে

                                const srsResult = calculateSRS(currentItem.level, rating);
                                currentItem.level = srsResult.level;
                                currentItem.next_review = srsResult.next_review;
                                
                                currentItem.pass_streak = 0; 

                                const totalDueEl = document.getElementById('total-due');
                                let currentTotal = parseInt(totalDueEl.textContent);
                                totalDueEl.textContent = Math.max(0, currentTotal - 1);
                            } else {
                                const S = parseInt(document.getElementById('streak-threshold').value) || 2;
								const randS = Math.floor(Math.random() * S) + 1; 
								const insertIndex = Math.min(7 + (2 * randS), dueQueue.length);
                                dueQueue.splice(insertIndex, 0, processedItem);
                            }
                        } else {
                            // লেভেল ০ না হলে (অন্যান্য লেভেলে) স্বাভাবিকভাবে সবসময়ই পয়েন্ট যোগ হবে
                            currentItem.score += points;

                            const srsResult = calculateSRS(currentItem.level, rating);
                            currentItem.level = srsResult.level;
                            currentItem.next_review = srsResult.next_review;
                            
                            currentItem.pass_streak = 0; 

                            const totalDueEl = document.getElementById('total-due');
                            let currentTotal = parseInt(totalDueEl.textContent);
                            totalDueEl.textContent = Math.max(0, currentTotal - 1);
                        }
                    } else if (isFailed) {
                        // ফেইল করলে পয়েন্ট বিয়োগ হবে এবং স্ট্রেইক ০ হয়ে যাবে
                        currentItem.score += points;
                        currentItem.pass_streak = 0;

                        const srsResult = calculateSRS(currentItem.level, rating);
                        currentItem.level = srsResult.level;
                        currentItem.next_review = srsResult.next_review;

                        const S = parseInt(document.getElementById('streak-threshold').value) || 2;
                        let minWait = 4 + S;
                        let maxWait = 6 + (2 * S);
                        let insertIndex = Math.floor(Math.random() * (maxWait - minWait + 1)) + minWait;

                        insertIndex = Math.min(insertIndex, dueQueue.length);
                        dueQueue.splice(insertIndex, 0, processedItem);
                    }
                }

                updateBoard();
                const changedCard = currentItem;
                nextCard();
                saveCardToCloud(changedCard, true);
            }

            // Delete Card Logic
            deleteBtn.addEventListener('click', async () => {
                if (!currentItem) return;
                
                const isConfirmed = confirm(`Are you sure you want to permanently delete this card?\n\n"${currentItem.question}"`);
                
                if (isConfirmed) {
                    const cardToDelete = currentItem;
                    const { error } = await supabase.from('user_flashcards').delete()
                        .eq('id', cardToDelete.id).eq('user_id', currentUser.id).eq('deck_key', currentDeckKey);
                    if (error) {
                        setCloudStatus(`Delete failed: ${error.message}`, 'error-message');
                        return;
                    }
                    // Remove from master array
                    flashcards = flashcards.filter(c => c.id !== cardToDelete.id);
                    
                    // Remove from active queue
                    dueQueue = dueQueue.filter(c => c.id !== cardToDelete.id);
                    
                    // Adjust UI totals
                    const totalDueEl = document.getElementById('total-due');
                    let currentTotal = parseInt(totalDueEl.textContent);
                    totalDueEl.textContent = Math.max(0, currentTotal - 1);

                    hasUnsavedChanges = false;
                    updateBoard();
                    nextCard();
                    setCloudStatus('Card deleted from cloud.', 'success-message');
                }
            });

            document.getElementById('btn-fail').onclick = () => handleFeedback('fail');
            document.getElementById('btn-pass').onclick = () => handleFeedback('pass');

            // --- 5. Display Logic --- (Original Logic)
            function nextCard() {
                try {
                    if (dueQueue.length === 0) {
                        currentItem = null;
                        isAnswerVisible = false;
                        drawFlashcard();
                        mainControls.style.display = flashcards.length > 0 ? 'flex' : 'none';
                        feedbackBtns2.style.display = 'none';
                        showAnswerBtn.style.display = 'none'; 
                        deleteBtn.style.display = 'none'; 
                        
                        if(flashcards.length > 0) {
                            if (parseInt(document.getElementById('total-due').textContent) > 0) {
                                loadMoreBtn.style.display = 'inline-block';
                            }
                        }
                        return;
                    }

                    let nextIndex = 0;
                    for (let i = 0; i < dueQueue.length; i++) {
                        if (!recentCardTracker.includes(dueQueue[i].question)) {
                            nextIndex = i;
                            break;
                        }
                    }

                    currentItem = dueQueue.splice(nextIndex, 1)[0];
                    dueQueue.unshift(currentItem); 

                    recentCardTracker.push(currentItem.question);
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

            // --- Canvas Drawing (Responsive & Bengali Diacritics Protected) ---
            function wrapTextAutoFit(context, text, x, centerY, maxWidth, maxHeight, baseFontSize, fontWeight, color, minFontSize = 14) {
                let fontSize = baseFontSize;
                let lines = [];
                let lineHeight = Math.round(fontSize * 1.48);

                while (fontSize >= minFontSize) {
                    context.font = `${fontWeight} ${fontSize}px 'Hind Siliguri', 'Poppins', sans-serif`;
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
                    if (currentLine) {
                        lines.push(currentLine);
                    }

                    const totalHeight = lines.length * lineHeight;
                    if (totalHeight <= maxHeight || fontSize <= minFontSize) {
                        break;
                    }
                    fontSize -= 2;
                }

                context.font = `${fontWeight} ${fontSize}px 'Hind Siliguri', 'Poppins', sans-serif`;
                context.fillStyle = color;
                context.textAlign = 'center';
                context.textBaseline = 'middle';

                const totalHeight = lines.length * lineHeight;
                let currentY = centerY - (totalHeight / 2) + (lineHeight / 2);

                lines.forEach(line => {
                    context.fillText(line, x, currentY);
                    currentY += lineHeight;
                });

                return { fontSize, lines, totalHeight };
            }

            function drawFlashcard() {
                updateCanvasSize();
                const theme = getThemeColors();

                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.fillStyle = theme.cardBg;
                ctx.fillRect(0, 0, canvas.width, canvas.height);

                if (!currentItem) {
                    ctx.fillStyle = theme.q;
                    ctx.font = `bold ${canvas.width > 500 ? '24px' : '20px'} 'Hind Siliguri', 'Poppins', sans-serif`;
                    ctx.textAlign = "center";
                    ctx.textBaseline = 'middle';
                    ctx.fillText(flashcards.length === 0 ? "Setup Required!" : "Session chunk complete!", canvas.width / 2, canvas.height / 2);
                    return;
                }

                ctx.fillStyle = theme.hint;
                ctx.font = "13px 'Hind Siliguri', 'Poppins', sans-serif";
                ctx.textAlign = "left";
                ctx.textBaseline = "alphabetic";
                ctx.fillText("Mode: Question ➔ Answer", 20, 26);

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

                    // Question in upper section
                    const qCenterY = (35 + dividerY) / 2;
                    const qMaxH = dividerY - 45;
                    const qBaseFont = isSquare ? 21 : 23;
                    wrapTextAutoFit(ctx, qText, canvas.width / 2, qCenterY, maxTextW, qMaxH, qBaseFont, "600", theme.q, 15);

                    // Divider line
                    ctx.beginPath();
                    ctx.moveTo(35, dividerY);
                    ctx.lineTo(canvas.width - 35, dividerY);
                    ctx.strokeStyle = theme.divider;
                    ctx.lineWidth = 1;
                    ctx.stroke();

                    // Answer in lower section (starts at 23-24px, auto-shrinks if long)
                    const aCenterY = (dividerY + canvas.height) / 2;
                    const aMaxH = canvas.height - dividerY - 30;
                    const aBaseFont = isSquare ? 23 : 22;
                    wrapTextAutoFit(ctx, aText, canvas.width / 2, aCenterY, maxTextW, aMaxH, aBaseFont, "500", theme.a, 14);
                }
            }

            // --- 6. Helpers ---
            function updateBoard() {
                document.getElementById('due-count').textContent = dueQueue.length;
                document.getElementById('total-count').textContent = flashcards.length;
            }

            function updateMessage(txt, type) {
                if(messageArea) {
                    messageArea.textContent = txt;
                    messageArea.className = type;
                }
            }

            // --- 7. Export Database to TXT --- (Original Logic)
            document.getElementById('export-btn').onclick = () => {
                if (flashcards.length === 0) return;
                
                let cleanFileName = currentDeckName.replace(/\s\(\d+\)/g, '');
                if (!cleanFileName.endsWith('.txt')) cleanFileName += '.txt';

                // Format the output: Question > Answer > Level > Score > Duedate
                const fileLines = flashcards.map(card => {
					return `${card.question} > ${card.answer} > ${card.level} > ${card.score} > ${card.next_review} > ${card.pass_streak || 0} > ${card.new_consecutive || 0}`;
				});
                
                const content = fileLines.join('\n');

                const blob = new Blob([content], { type: 'text/plain;charset=utf-8;' });
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = cleanFileName;
                a.click();
                URL.revokeObjectURL(a.href);
                
                alert(`Backup downloaded as ${cleanFileName}. Keep this file safe. 💾`);
            };

            // Start screen init
            updateCanvasSize();
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            const initTheme = getThemeColors();
            ctx.fillStyle = initTheme.cardBg;
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // --- Export Low Score Cards Functionality ---
            const exportLowScoreBtn = document.getElementById('export-low-score-btn');
            if (exportLowScoreBtn) {
                exportLowScoreBtn.addEventListener('click', () => {
                    if (flashcards.length === 0) {
                        alert("আগে Database (.txt) আপলোড করুন!");
                        return;
                    }

                    const value = Number(document.getElementById("export-max-score").value);
                    if (Number.isNaN(value)) {
                        alert("Invalid Score");
                        return;
                    }

                    const targetCards = flashcards.filter(card => card.score < value);

                    if (targetCards.length === 0) {
                        alert(`আপনার ডাটাবেসে ${value} এর নিচে স্কোর থাকা কোনো কার্ড নেই।`);
                        return;
                    }

                    const fileLines = targetCards.map(card => `${card.question} > ${card.answer}`);
                    const content = fileLines.join('\n');

                    const blob = new Blob([content], { type: 'text/plain;charset=utf-8;' });
                    const a = document.createElement('a');
                    a.href = URL.createObjectURL(blob);
                    
                    let baseName = currentDeckName.replace('.txt', '');
                    a.download = `${baseName}_scoreBelow${value}.txt`;
                    
                    a.click();
                    URL.revokeObjectURL(a.href);
                });
            }

			// --- Keyboard Shortcuts
			document.addEventListener('keydown', (event) => {
				if (playerPage.style.display !== 'block') return;
				if (gkModal.style.display === 'flex') return;

				// Ignore auto-repeat when a key is held down
				if (event.repeat) return;

				// RIGHT ALT = Show Answer / Fail
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

				// RIGHT CTRL = Save Progress / Pass
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
        });