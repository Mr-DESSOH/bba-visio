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
    config: {
        'iceServers': [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            { urls: 'stun:stun.services.mozilla.com' },
            { urls: 'stun:openrelay.metered.ca:80' }
        ],
        'iceCandidatePoolSize': 10
    }
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
        peer.on('call', call => {
            call.answer(localStream);
            call.on('stream', stream => {
                // On affiche la vidéo du prof si on est étudiant
                if (!isProfessor) remoteVideo.srcObject = stream;
            });
        });

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