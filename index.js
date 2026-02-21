// CONFIGURATION ET VARIABLES
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const chatBox = document.getElementById('chat-box');
const studentListContainer = document.getElementById('student-list');

let localStream, peer, isProfessor = false, userName = "";
let activeConnections = [], connectedStudents = [];
let micEnabled = true, handRaised = false;
let mediaRecorder, recordedChunks = [];

// SERVEURS DE CONNEXION (STUN/TURN) - Crucial pour 4G et Wi-Fi différents
const peerConfig = {
const peerConfig = {
    // Force la connexion via des serveurs relais si le direct échoue
    config: {
        'iceServers': [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            { urls: 'stun:stun3.l.google.com:19302' },
            { urls: 'stun:stun4.l.google.com:19302' },
            // Serveurs STUN additionnels pour traverser les NAT stricts
            { urls: 'stun:stun.services.mozilla.com' },
            { urls: 'stun:stun.ekiga.net' },
            { urls: 'stun:stun.ideasip.com' },
            { urls: 'stun:stun.schlund.de' }
        ],
        'iceCandidatePoolSize': 10,
        'sdpSemantics': 'unified-plan'
    },
    // Configuration du serveur de signalement PeerJS
    host: '0.peerjs.com',
    secure: true,
    port: 443,
    debug: 1 // Garde 1 pour voir les erreurs critiques uniquement
};

let LISTE_PROFS = JSON.parse(localStorage.getItem('bba_profs')) || {
    "DESSOH2026": "M. DESSOH",
    "ADMIN_BBA": "Direction BBA"
};
let currentCode = "";

// INITIALISATION UNIQUE ET PROPRE
async function init() {
    userName = prompt("Entrez votre nom complet :") || "Étudiant_" + Math.floor(Math.random()*100);
    document.getElementById('display-name').innerText = userName;

    try {
        // Demande caméra et micro
        localStream = await navigator.mediaDevices.getUserMedia({ 
            video: { width: 640, height: 480 }, 
            audio: true 
        });
        localVideo.srcObject = localStream;

        // Création de l'instance Peer
        peer = new Peer(undefined, peerConfig);

        peer.on('open', id => {
            console.log("Mon ID : " + id);
            document.getElementById('display-id').innerText = "VOTRE ID : " + id;
        });

        // Gestion des appels (vidéo entrante)
// Remplace ton peer.on('call') par cette version robuste
function setupPeerListeners() {
    peer.on('call', call => {
        console.log("Tentative de poignée de main WebRTC...");
        
        // Option pro : On peut ajouter des contraintes de bande passante ici
        call.answer(localStream);

        call.on('stream', remoteStream => {
            if (!isProfessor) {
                // L'étudiant voit le prof
                remoteVideo.srcObject = remoteStream;
            } else {
                // Le prof crée une vignette pour chaque étudiant qui rejoint
                ajouterVignetteEtudiant(call.peer, remoteStream);
            }
        });

        // Si l'appel coupe, on nettoie
        call.on('close', () => {
            const el = document.getElementById(`wrapper-${call.peer}`);
            if (el) el.remove();
        });
        
        call.on('error', err => console.error("Erreur Appel:", err));
    });

    peer.on('error', err => {
        if (err.type === 'peer-unavailable') {
            alert("L'ID du Professeur est introuvable. Vérifiez le code.");
        } else if (err.type === 'network') {
            alert("Erreur réseau : Vérifiez votre 4G/Wi-Fi.");
        }
        console.error("PeerJS Error Type:", err.type);
    });
}

// Fonction de création de vignette améliorée
function ajouterVignetteEtudiant(peerId, stream) {
    if (document.getElementById(`video-${peerId}`)) return;

    const container = document.getElementById('student-list');
    const wrapper = document.createElement('div');
    wrapper.id = `wrapper-${peerId}`;
    wrapper.className = "bg-gray-800 p-2 rounded-xl border border-blue-900 mb-3 animate-pulse";
    
    wrapper.innerHTML = `
        <div class="flex justify-between items-center mb-1">
            <span class="text-[8px] font-bold text-blue-400">ID: ${peerId.substring(0,6)}</span>
            <button onclick="agrandirVideo('${peerId}')" class="text-[8px] bg-blue-600 px-1 rounded">AGRANDIR</button>
        </div>
        <video id="video-${peerId}" autoplay playsinline class="w-full h-24 bg-black rounded-lg object-cover"></video>
    `;
    
    container.appendChild(wrapper);
    const videoEl = document.getElementById(`video-${peerId}`);
    videoEl.srcObject = stream;
    
    // Une fois que la vidéo charge, on retire l'animation de chargement
    videoEl.onloadedmetadata = () => wrapper.classList.remove('animate-pulse');
}

// Optionnel : Mettre l'élève en grand
function agrandirVideo(peerId) {
    const stream = document.getElementById(`video-${peerId}`).srcObject;
    remoteVideo.srcObject = stream;
}

// FONCTION POUR AJOUTER LA VIDEO DE L'ELEVE CHEZ LE PROF
function creerVignetteEtudiant(id, stream) {
    // On vérifie si la vidéo existe déjà pour ne pas faire de doublons
    if (document.getElementById(`video-${id}`)) return;

    const container = document.getElementById('student-list');
    const div = document.createElement('div');
    div.id = `wrapper-${id}`;
    div.className = "bg-gray-800 p-2 rounded-lg border border-blue-500 mb-2";
    
    div.innerHTML = `
        <p class="text-[9px] mb-1 font-bold text-blue-400">ÉLÈVE : ${id.substring(0,5)}</p>
        <video id="video-${id}" autoplay playsinline class="w-full h-32 rounded bg-black object-cover"></video>
    `;
    
    container.appendChild(div);
    document.getElementById(`video-${id}`).srcObject = stream;
}
        // Gestion des connexions de données (chat, admin)
        peer.on('connection', conn => setupData(conn));

        peer.on('error', err => {
            console.error("Erreur PeerJS : ", err.type);
            if(err.type === 'browser-incompatible') alert("Navigateur non compatible");
        });

    } catch (e) {
        console.error(e);
        alert("ERREUR : Caméra/Micro bloqués ou pas de HTTPS.");
    }
}

// LOGIQUE DE DONNÉES ET ÉVÉNEMENTS
function setupData(conn) {
    if (!activeConnections.find(c => c.peer === conn.peer)) activeConnections.push(conn);
    
    conn.on('open', () => {
        conn.send({ type: "HANDSHAKE", name: userName });
    });

    conn.on('data', data => {
        if (data.type === "HANDSHAKE" && isProfessor) {
            if (!connectedStudents.find(s => s.id === conn.peer)) {
                connectedStudents.push({ id: conn.peer, name: data.name, hand: false });
            }
            renderStudentList();
        }
        else if (data.type === "HAND_RAISE" && isProfessor) {
            const s = connectedStudents.find(x => x.id === data.peerId);
            if (s) { s.hand = true; renderStudentList(); }
        }
        else if (data.type === "HAND_DOWN" && isProfessor) {
            const s = connectedStudents.find(x => x.id === data.peerId);
            if (s) { s.hand = false; renderStudentList(); }
        }
        else if (data.type === "PPT_ON") {
            document.getElementById('ppt-frame').src = data.url;
            document.getElementById('ppt-frame').classList.remove('hidden');
        }
        else if (data.type === "PPT_OFF") {
            document.getElementById('ppt-frame').classList.add('hidden');
        }
        else if (typeof data === "string") {
            addChat(data, 'dist');
        }
    });
}

// FONCTIONS PROFESSEUR
function devenirProf() {
    const codeSaisi = prompt("Code d'accès Admin :");
    if (LISTE_PROFS[codeSaisi]) {
        isProfessor = true;
        currentCode = codeSaisi;
        userName = LISTE_PROFS[codeSaisi];
        document.getElementById('display-name').innerText = userName + " (ADMIN)";
        document.getElementById('admin-panel').classList.remove('hidden');
        document.getElementById('chat-ui').classList.add('hidden');
        document.getElementById('local-wrapper').style.display = "none";
        remoteVideo.srcObject = localStream; // Le prof se voit en grand
        renderStudentList();
    } else {
        alert("Code incorrect.");
    }
}

function rejoindreCours() {
    const profId = document.getElementById('target-id').value;
    if (!profId) return alert("Entrez l'ID du Professeur");
    
    const conn = peer.connect(profId);
    setupData(conn);
    
    peer.call(profId, localStream).on('stream', stream => {
        remoteVideo.srcObject = stream;
    });
}

// CHAT ET UI
function envoyerMessage() {
    const input = document.getElementById('chat-input');
    if(!input.value) return;
    const msg = `${userName}: ${input.value}`;
    activeConnections.forEach(c => { if(c.open) c.send(msg); });
    addChat(input.value, 'moi');
    input.value = "";
}

function addChat(m, t) {
    const d = document.createElement('div');
    d.className = t === 'moi' ? "bg-blue-600 ml-auto p-2 rounded-lg max-w-[80%] text-xs" : "bg-gray-800 p-2 rounded-lg max-w-[80%] text-xs";
    d.innerText = m;
    chatBox.appendChild(d);
    chatBox.scrollTop = chatBox.scrollHeight;
}

function toggleMic() {
    micEnabled = !micEnabled;
    localStream.getAudioTracks()[0].enabled = micEnabled;
    document.getElementById('btn-mic').innerText = micEnabled ? "🎤 MICRO ON" : "🎤 MICRO OFF";
    document.getElementById('btn-mic').classList.toggle('bg-red-600', !micEnabled);
}

function leverMain() {
    handRaised = !handRaised;
    document.getElementById('btn-hand').classList.toggle('bg-orange-600', handRaised);
    activeConnections.forEach(c => { if(c.open) c.send({ type: handRaised ? "HAND_RAISE" : "HAND_DOWN", peerId: peer.id }); });
}

function renderStudentList() {
    studentListContainer.innerHTML = "";
    connectedStudents.forEach(s => {
        studentListContainer.innerHTML += `
            <div class="bg-gray-800 p-2 rounded-lg border-l-4 ${s.hand ? 'border-orange-500' : 'border-blue-600'} flex justify-between items-center">
                <span class="text-[10px] font-bold">${s.name} ${s.hand ? '✋' : ''}</span>
            </div>`;
    });
}

// DOCUMENTS
function partagerFichier(input) {
    const reader = new FileReader();
    reader.onload = (e) => {
        const data = { type: "PPT_ON", url: e.target.result };
        document.getElementById('ppt-frame').src = data.url;
        document.getElementById('ppt-frame').classList.remove('hidden');
        activeConnections.forEach(c => { if(c.open) c.send(data); });
    };
    reader.readAsDataURL(input.files[0]);
}

function fermerDocument() {
    document.getElementById('ppt-frame').classList.add('hidden');
    activeConnections.forEach(c => { if(c.open) c.send({ type: "PPT_OFF" }); });
}

// ENREGISTREMENT
async function toggleRecord() {
    const btn = document.getElementById('btn-record');
    if (!mediaRecorder || mediaRecorder.state === "inactive") {
        try {
            const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
            mediaRecorder = new MediaRecorder(stream);
            recordedChunks = [];
            mediaRecorder.ondataavailable = e => recordedChunks.push(e.data);
            mediaRecorder.onstop = () => {
                const blob = new Blob(recordedChunks, { type: "video/webm" });
                const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
                a.download = "Cours-BBA.webm"; a.click();
                btn.classList.remove('recording-active');
            };
            mediaRecorder.start();
            btn.classList.add('recording-active');
        } catch(e) { alert("Capture annulée"); }
    } else { mediaRecorder.stop(); }
}

// LANCEMENT
init();