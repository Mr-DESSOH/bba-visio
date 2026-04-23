// ============================================
// BBA-VISIO ELITE v21 - index.js COMPLÈTE
// ============================================

const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const chatBox = document.getElementById('chat-box');
const pptViewer = document.getElementById('ppt-viewer');

// Variables globales
let localStream, peer, isProfessor = false, userName = "", activeConnections = [];
let studentStreams = {}, connectedStudents = [], windowOffset = 0;
let handRaised = false, isRecording = false, isMicOn = true;
let mediaRecorder = null, recordedChunks = [];

// ============================================
// CONFIGURATION PEERJS RENFORCÉE
// ============================================
const peerConfig = {
    host: 'peerjs-server.herokuapp.com', // OU votre serveur custom
    port: 443,
    path: '/',
    secure: true,
    debug: 2, // 0=silent, 1=error, 2=warn, 3=all
    config: {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
        ]
    }
};

// ============================================
// INITIALISATION
// ============================================
async function init() {
    userName = prompt("Nom et Prénom :") || "Étudiant";
    document.getElementById('display-name').innerText = userName;

    try {
        // Demander accès caméra/micro
        localStream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                facingMode: "user"
            },
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            }
        });

        localVideo.srcObject = localStream;
        localVideo.muted = true;
        localVideo.onloadedmetadata = () => localVideo.play();

        // Créer l'instance Peer
        const suffixe = Math.random().toString(36).substring(2, 6).toUpperCase();
        const monID = "BBA-" + suffixe;

        peer = new Peer(monID, peerConfig);

        setupPeerListeners();

        peer.on('open', (id) => {
            console.log("✅ ID Professionnel généré : " + id);
            document.getElementById('display-id').innerText = id;
            
            const dot = document.getElementById('status-dot');
            dot.classList.remove('bg-gray-600');
            dot.classList.add('bg-green-500', 'status-pulse');
        });

        peer.on('error', (err) => {
            console.error("❌ Erreur PeerJS :", err);
            alert("Erreur de connexion. Veuillez rafraîchir la page.");
        });

    } catch (error) {
        console.error("❌ Erreur Média :", error);
        alert("⚠️ Accès caméra/micro refusé ou indisponible. Vérifiez les permissions.");
    }
}

// ============================================
// GESTION DES ÉVÉNEMENTS PEER
// ============================================
function setupPeerListeners() {
    // Recevoir un appel vidéo entrant
    peer.on('call', (call) => {
        console.log("📞 Appel entrant de : " + call.peer);

        // Répondre avec notre propre flux
        call.answer(localStream);

        call.on('stream', (remoteStream) => {
            console.log("✅ Flux vidéo reçu de : " + call.peer);

            if (!isProfessor) {
                // Étudiant : voit le prof en grand
                remoteVideo.srcObject = remoteStream;
                remoteVideo.onloadedmetadata = () => remoteVideo.play();
            } else {
                // Prof : ajoute l'étudiant à sa liste
                studentStreams[call.peer] = remoteStream;
                ajouterVignetteEtudiant(call.peer, remoteStream);
            }
        });

        call.on('error', (err) => {
            console.error("❌ Erreur appel :", err);
        });

        call.on('close', () => {
            console.log("📞 Appel fermé avec : " + call.peer);
            if (isProfessor) {
                fermerFenetre(call.peer);
                studentStreams[call.peer] = null;
            }
        });
    });

    // Recevoir une connexion data
    peer.on('connection', (conn) => {
        console.log("📡 Connexion data entrante de : " + conn.peer);
        setupData(conn);
    });
}

// ============================================
// GESTION DES CONNEXIONS DATA (Chat/Commandes)
// ============================================
function setupData(conn) {
    // Ajouter à la liste si pas déjà là
    if (!activeConnections.find(c => c.peer === conn.peer)) {
        activeConnections.push(conn);
        console.log("➕ Connexion ajoutée. Total : " + activeConnections.length);
    }

    // Poignée de main
    conn.on('open', () => {
        console.log("🤝 Échange de données ouvert avec : " + conn.peer);
        conn.send({
            type: "HANDSHAKE",
            name: userName,
            isProfessor: isProfessor
        });
    });

    // Réception de données
    conn.on('data', (data) => {
        handleData(data, conn);
    });

    conn.on('error', (err) => {
        console.error("❌ Erreur data :", err);
    });

    conn.on('close', () => {
        console.log("❌ Connexion fermée avec : " + conn.peer);
        activeConnections = activeConnections.filter(c => c.peer !== conn.peer);
        
        // Si prof, retirer de la liste
        if (isProfessor) {
            connectedStudents = connectedStudents.filter(s => s.id !== conn.peer);
            renderList();
        }
    });
}

// ============================================
// TRAITEMENT DES MESSAGES
// ============================================
function handleData(data, conn) {
    if (typeof data === 'object') {
        switch (data.type) {
            case "HANDSHAKE":
                if (isProfessor) {
                    if (!connectedStudents.find(s => s.id === conn.peer)) {
                        connectedStudents.push({
                            id: conn.peer,
                            name: data.name,
                            hand: false
                        });
                        renderList();
                        addChat(`Système: ${data.name} a rejoint le cours.`, 'sys');
                        console.log("👥 Étudiant ajouté : " + data.name);
                    }
                }
                break;

            case "HAND_RAISE":
                if (isProfessor) {
                    const student = connectedStudents.find(s => s.id === data.peerId);
                    if (student) {
                        student.hand = true;
                        renderList();
                        addChat(`🖐️ ${data.name} veut parler.`, 'sys');
                        playSound('notification');
                    }
                }
                break;

            case "HAND_DOWN":
                if (isProfessor) {
                    const student = connectedStudents.find(s => s.id === data.peerId);
                    if (student) {
                        student.hand = false;
                        renderList();
                        fermerFenetre(data.peerId);
                    }
                }
                break;

            case "PPT_ON":
                document.getElementById('whiteboard').style.display = 'flex';
                pptViewer.src = data.url;
                document.getElementById('doc-title').innerText = data.filename || "Document partagé";
                addChat("📄 Un document a été partagé.", 'sys');
                break;

            case "PPT_OFF":
                document.getElementById('whiteboard').style.display = 'none';
                pptViewer.src = '';
                addChat("📄 Partage de document fermé.", 'sys');
                break;

            case "CMD_MUTE":
                localStream.getAudioTracks()[0].enabled = false;
                isMicOn = false;
                document.getElementById('btn-mic').classList.remove('bg-blue-600/10', 'border-blue-500/50');
                document.getElementById('btn-mic').classList.add('bg-red-600/10', 'border-red-500/50');
                document.getElementById('btn-mic').innerText = '🔇 MICRO OFF';
                addChat("⚠️ Votre micro a été désactivé par le professeur.", 'sys');
                break;

            case "CMD_KICK":
                addChat("❌ Vous avez été expulsé par le professeur.", 'sys');
                setTimeout(() => location.reload(), 2000);
                break;

            case "MSG":
                addChat(`${data.sender}: ${data.text}`, 'dist');
                break;

            default:
                console.warn("Type de message inconnu :", data.type);
        }
    } else if (typeof data === "string") {
        // Message chat simple (ancien format)
        addChat(data, 'dist');
    }
}

// ============================================
// POINT 1 : REJOINDRE LE PROF (ÉTUDIANT)
// ============================================
function rejoindreCours() {
    const profId = document.getElementById('target-id').value.trim();
    if (!profId) {
        alert("❌ Veuillez entrer l'ID BBA-XXXX du professeur");
        return;
    }

    console.log("📞 Tentative de connexion au professeur : " + profId);

    // 1. Connexion data (Chat/Contrôle)
    const conn = peer.connect(profId, { reliable: true });
    setupData(conn);

    // 2. Appel vidéo
    const call = peer.call(profId, localStream);

    call.on('stream', (remoteStream) => {
        console.log("✅ Flux vidéo du professeur reçu !");
        remoteVideo.srcObject = remoteStream;
        remoteVideo.onloadedmetadata = () => remoteVideo.play();
    });

    call.on('error', (err) => {
        console.error("❌ Erreur appel :", err);
        alert("❌ Impossible de joindre ce cours. Vérifiez l'ID et réessayez.");
    });
}

// ============================================
// POINT 2 : MULTI-FENÊTRES EN CASCADE (PROF)
// ============================================
function accepterEtudiant(id, name) {
    if (!studentStreams[id]) {
        console.warn("❌ Pas de flux vidéo pour : " + id);
        return;
    }

    if (document.getElementById(`win-${id}`)) {
        console.log("⚠️ Fenêtre déjà ouverte pour : " + name);
        return;
    }

    const win = document.createElement('div');
    win.id = `win-${id}`;
    win.className = "fixed bg-orange-600 rounded-2xl shadow-2xl border-2 border-orange-500 overflow-hidden p-1 min-w-[250px] min-h-[200px]";
    win.style.zIndex = 200 + connectedStudents.length;
    win.style.top = (50 + windowOffset) + "px";
    win.style.left = (50 + windowOffset) + "px";
    windowOffset = (windowOffset + 40) % 200;

    win.innerHTML = `
        <div class="bg-orange-600 px-4 py-2 flex justify-between items-center cursor-move select-none rounded-t-lg drag-handle">
            <span class="text-xs font-black uppercase text-white">📹 ${name}</span>
            <button type="button" onclick="fermerFenetre('${id}')" class="text-white font-bold hover:scale-125 transition text-lg" aria-label="Fermer">✕</button>
        </div>
        <video id="vid-${id}" autoplay playsinline class="w-full h-full bg-black rounded-b-lg object-cover"></video>
    `;

    document.body.appendChild(win);

    const video = document.getElementById(`vid-${id}`);
    video.srcObject = studentStreams[id];
    video.onloadedmetadata = () => video.play();

    // Drag & drop (drag simple)
    makeDraggable(win);

    console.log("📺 Fenêtre ouverte pour : " + name);
}

// ============================================
// FERMER UNE FENÊTRE D'ÉTUDIANT
// ============================================
function fermerFenetre(id) {
    const el = document.getElementById(`win-${id}`);
    if (el) {
        el.style.animation = "slideDown 0.3s ease-in";
        setTimeout(() => el.remove(), 300);
        console.log("❌ Fenêtre fermée pour : " + id);
    }
}

// ============================================
// AJOUTER VIGNETTE ÉTUDIANT (PROF)
// ============================================
function ajouterVignetteEtudiant(peerId, stream) {
    // La vignette est ajoutée à la liste des étudiants
    const student = connectedStudents.find(s => s.id === peerId);
    if (student) {
        console.log("✅ Vignette ajoutée pour : " + student.name);
    }
}

// ============================================
// AFFICHER LA LISTE DES ÉTUDIANTS (PROF)
// ============================================
function renderList() {
    const list = document.getElementById('student-list');
    if (!list) return;

    list.innerHTML = "";
    connectedStudents.forEach(s => {
        const isHandRaised = s.hand ? 'border-orange-500 bg-orange-600/10' : 'border-blue-500 bg-blue-600/10';
        list.innerHTML += `
            <div class="${isHandRaised} p-3 rounded-xl border-l-4 transition-all mb-2">
                <div class="flex justify-between items-center mb-2">
                    <span class="text-xs font-bold text-white truncate">${s.name}</span>
                    ${s.hand ? '<span class="text-orange-400 text-[9px] font-black animate-pulse">🖐️ MAIN LEVÉE</span>' : ''}
                </div>
                <div class="flex flex-col gap-2">
                    ${s.hand ? `
                        <button type="button" onclick="accepterEtudiant('${s.id}', '${s.name.replace(/'/g, "\\'")}')" 
                            class="w-full bg-green-600 hover:bg-green-500 py-1.5 rounded text-[10px] font-bold transition-colors">
                            📹 Ouvrir Vidéo
                        </button>
                    ` : ''}
                    <div class="flex gap-1">
                        <button type="button" onclick="adminAction('${s.id}', 'CMD_MUTE')" 
                            class="flex-1 bg-gray-700 hover:bg-orange-700 py-1 rounded text-[9px] font-bold transition-colors">
                            🔇 MUTE
                        </button>
                        <button type="button" onclick="adminAction('${s.id}', 'CMD_KICK')" 
                            class="flex-1 bg-gray-700 hover:bg-red-700 py-1 rounded text-[9px] font-bold transition-colors">
                            ❌ KICK
                        </button>
                    </div>
                </div>
            </div>
        `;
    });
}

// ============================================
// DEVENIR PROFESSEUR
// ============================================
function devenirProf() {
    const code = prompt("🔐 Code professeur :");
    if (code === "BBA2026") {
        isProfessor = true;
        console.log("✅ Mode professeur activé !");

        document.getElementById('admin-panel').classList.remove('hidden');
        document.getElementById('chat-ui').classList.add('hidden');

        // Afficher la propre vidéo du prof
        remoteVideo.srcObject = localStream;
        remoteVideo.play