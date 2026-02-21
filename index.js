const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const mainContainer = document.getElementById('main-container');
const chatBox = document.getElementById('chat-box');
const studentListContainer = document.getElementById('student-list');

let localStream, peer, isProfessor = false, userName = "";
let activeConnections = [], studentStreams = {}, connectedStudents = [];
let windowOffset = 0, micEnabled = true, handRaised = false;
let mediaRecorder, recordedChunks = [];
let recognition;
let isTranscribing = false;

// BASE DE DONNÉES DES PROFS (Chargée depuis la mémoire du navigateur ou défaut)
let LISTE_PROFS = JSON.parse(localStorage.getItem('bba_profs')) || {
    "DESSOH2026": "M. DESSOH",
    "ADMIN_BBA": "Direction BBA"
};
let currentCode = "";

// INITIALISATION
async function init() {
    userName = prompt("Nom complet :") || "Étudiant";
    document.getElementById('display-name').innerText = userName;
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localVideo.srcObject = localStream;

// CONFIGURATION RÉSEAU AVANCÉE (STUN + TURN)
// Ces serveurs permettent de traverser les pare-feux des différents Wi-Fi
const peerConfig = {
    config: {
        'iceServers': [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            { urls: 'stun:stun3.l.google.com:19302' },
            { urls: 'stun:stun4.l.google.com:19302' },
            // Serveurs de secours supplémentaires
            { urls: 'stun:stun.services.mozilla.com' },
            // Note: En entreprise, on utilise normalement un serveur TURN privé
            // Ici, on utilise des serveurs publics pour maximiser les chances
            { urls: 'stun:openrelay.metered.ca:80' }
        ],
        'iceCandidatePoolSize': 10
    },
    debug: 3 // Mode debug activé pour voir les erreurs de connexion dans la console
};

async function init() {
    userName = prompt("Nom complet :") || "Étudiant";
    document.getElementById('display-name').innerText = userName;

    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localVideo.srcObject = localStream;

        // On applique la configuration renforcée
        peer = new Peer(undefined, peerConfig);

        peer.on('open', id => {
            console.log("Connecté au serveur de signalement avec l'ID :", id);
            document.getElementById('display-id').innerText = "VOTRE ID : " + id;
        });

        // Gestion des appels entrants (Réception vidéo du prof ou élève)
        peer.on('call', call => {
            console.log("Appel entrant de :", call.peer);
            call.answer(localStream);
            call.on('stream', stream => {
                studentStreams[call.peer] = stream;
                // Si je suis étudiant, le flux entrant est forcément le prof
                if (!isProfessor) {
                    remoteVideo.srcObject = stream;
                }
            });
            
            call.on('error', err => {
                console.error("Erreur WebRTC sur l'appel :", err);
            });
        });

        peer.on('connection', conn => setupData(conn));

    } catch (e) { 
        console.error("Erreur d'initialisation :", e);
        alert("Erreur média : Vérifiez que vous êtes en HTTPS."); 
    }
}

        peer.on('open', id => document.getElementById('display-id').innerText = "ID: " + id);
        peer.on('call', call => {
            call.answer(localStream);
            call.on('stream', stream => {
                studentStreams[call.peer] = stream;
                if (!isProfessor) remoteVideo.srcObject = stream;
            });
        });
        peer.on('connection', conn => setupData(conn));
    } catch (e) { alert("Erreur média : Caméra/Micro requis."); }
}

// GESTION DES ACCÈS PROFESSEUR
function devenirProf() {
    const codeSaisi = prompt("Entrez votre code d'accès personnel :");
    if (LISTE_PROFS[codeSaisi]) {
        isProfessor = true;
        currentCode = codeSaisi;
        userName = LISTE_PROFS[codeSaisi];
        
        // Mise à jour UI
        document.getElementById('display-name').innerText = userName + " (ADMIN)";
        document.getElementById('admin-panel').classList.remove('hidden');
        document.getElementById('btn-settings').classList.remove('hidden');
        document.getElementById('chat-ui').classList.add('hidden');
        
        remoteVideo.srcObject = localStream;
        document.getElementById('local-wrapper').style.display = "none";
        renderStudentList();
    } else {
        alert("Code d'accès invalide.");
    }
}

// MODIFIER LE PROFIL (NOM ET CODE)
function modifierProfil() {
    const nouveauNom = prompt("Changer votre nom d'affichage :", userName);
    const nouveauCode = prompt("Nouveau code secret (min 4 caractères) :");

    if (nouveauCode && nouveauCode.length >= 4) {
        delete LISTE_PROFS[currentCode];
        LISTE_PROFS[nouveauCode] = nouveauNom;
        currentCode = nouveauCode;
        userName = nouveauNom;
        
        // Sauvegarde dans le navigateur (localStorage)
        localStorage.setItem('bba_profs', JSON.stringify(LISTE_PROFS));
        
        document.getElementById('display-name').innerText = userName + " (ADMIN)";
        alert("Profil enregistré ! Ce code sera mémorisé sur ce navigateur.");
    } else {
        alert("Action annulée ou code trop court.");
    }
}

// --- LOGIQUE WEB-RTC & DOCUMENTS ---
function setupData(conn) {
    if (!activeConnections.find(c => c.peer === conn.peer)) activeConnections.push(conn);
    conn.on('open', () => conn.send({ type: "HANDSHAKE", name: userName }));
    conn.on('data', data => {
        if (data.type === "CMD_KICK") { alert("Expulsé."); window.location.reload(); }
        else if (data.type === "HANDSHAKE" && isProfessor) {
            if (!connectedStudents.find(s => s.id === conn.peer)) {
                connectedStudents.push({ id: conn.peer, name: data.name, hand: false });
            }
            renderStudentList();
        }
        else if (data.type === "HAND_RAISE" && isProfessor) {
            const s = connectedStudents.find(x => x.id === data.peerId);
            if (s) s.hand = true; renderStudentList();
        }
        else if (data.type === "HAND_DOWN" && isProfessor) {
            const s = connectedStudents.find(x => x.id === data.peerId);
            if (s) s.hand = false; renderStudentList(); fermerFenetre(data.peerId);
        }
        else if (data.type === "CMD_MUTE") {
            localStream.getAudioTracks()[0].enabled = false;
            document.getElementById('btn-mic').innerText = "🎤 MICRO OFF";
        }
        else if (data.type === "PPT_ON") {
            document.getElementById('ppt-frame').src = data.url;
            document.getElementById('ppt-frame').classList.remove('hidden');
        }
        else if (data.type === "PPT_OFF") {
            document.getElementById('ppt-frame').classList.add('hidden');
            document.getElementById('ppt-frame').src = "";
        }
        else if (typeof data === "string") { addChat(data, 'dist'); }
    });
}

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

// --- UTILITAIRES ---
function renderStudentList() {
    if (!studentListContainer) return;
    studentListContainer.innerHTML = "";
    connectedStudents.forEach(s => {
        studentListContainer.innerHTML += `
            <div class="bg-gray-800 p-3 rounded-xl border-l-4 ${s.hand ? 'border-orange-500' : 'border-blue-600'}">
                <div class="flex justify-between items-center mb-2"><span class="text-xs font-bold">${s.name}</span>${s.hand ? '✋' : ''}</div>
                <div class="flex gap-1">
                    ${s.hand ? `<button onclick="accepterEtudiant('${s.id}', '${s.name}')" class="bg-green-600 px-2 py-1 rounded text-[9px] font-bold">VOIR</button>` : ''}
                    <button onclick="adminAction('${s.id}', 'CMD_MUTE')" class="bg-gray-700 px-2 py-1 rounded text-[9px]">MUTE</button>
                    <button onclick="adminAction('${s.id}', 'CMD_KICK')" class="bg-red-900 px-2 py-1 rounded text-[9px]">KICK</button>
                </div>
            </div>`;
    });
}

function leverMain() {
    handRaised = !handRaised;
    document.getElementById('btn-hand').classList.toggle('bg-orange-600', handRaised);
    activeConnections.forEach(c => { if(c.open) c.send({ type: handRaised ? "HAND_RAISE" : "HAND_DOWN", peerId: peer.id }); });
}

function rejoindreCours() {
    const profId = document.getElementById('target-id').value;
    if (!profId) return;
    const conn = peer.connect(profId); setupData(conn);
    peer.call(profId, localStream).on('stream', s => { remoteVideo.srcObject = s; });
}

async function toggleRecord() {
    const btn = document.getElementById('btn-record');
    if (!mediaRecorder || mediaRecorder.state === "inactive") {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        mediaRecorder = new MediaRecorder(stream);
        recordedChunks = [];
        mediaRecorder.ondataavailable = e => recordedChunks.push(e.data);
        mediaRecorder.onstop = () => {
            const blob = new Blob(recordedChunks, { type: "video/webm" });
            const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
            a.download = "BBA-Capture.webm"; a.click();
            btn.classList.remove('recording-active'); btn.innerText = "🔴 REC";
        };
        mediaRecorder.start(); btn.classList.add('recording-active'); btn.innerText = "🛑 STOP";
    } else { mediaRecorder.stop(); }
}
function toggleTranscription() {
    const btn = document.getElementById('btn-transcribe');
    const zone = document.getElementById('transcription-zone');

    if (!isTranscribing) {
        // Initialisation de l'API Web Speech
        window.SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        
        if (!window.SpeechRecognition) {
            alert("Désolé, votre navigateur ne supporte pas la transcription vocale.");
            return;
        }

        recognition = new SpeechRecognition();
        recognition.lang = 'fr-FR'; // Langue : Français
        recognition.continuous = true; // Ne s'arrête pas quand on fait une pause
        recognition.interimResults = true; // Affiche le texte pendant qu'on parle

        recognition.onresult = (event) => {
            let transcript = "";
            for (let i = event.resultIndex; i < event.results.length; i++) {
                transcript += event.results[i][0].transcript;
            }
            
            // 1. Affichage local
            document.getElementById('transcript-text').innerText = transcript;
            
            // 2. Envoi aux autres participants (Étudiants)
            activeConnections.forEach(c => {
                if(c.open) c.send({ type: "TRANSCRIPTION", text: transcript });
            });
        };

        recognition.start();
        isTranscribing = true;
        btn.classList.replace('bg-purple-600', 'bg-red-500');
        zone.classList.remove('hidden');
    } else {
        recognition.stop();
        isTranscribing = false;
        btn.classList.replace('bg-red-500', 'bg-purple-600');
        zone.classList.add('hidden');
    }
}
function toggleMic() {
    micEnabled = !micEnabled;
    localStream.getAudioTracks()[0].enabled = micEnabled;
    document.getElementById('btn-mic').classList.toggle('bg-blue-600', micEnabled);
}

function addChat(m, t) {
    const d = document.createElement('div');
    d.className = t === 'moi' ? "bg-blue-600 ml-auto p-2 rounded-lg max-w-[80%]" : "bg-gray-800 p-2 rounded-lg max-w-[80%]";
    d.innerText = m; chatBox.appendChild(d); chatBox.scrollTop = chatBox.scrollHeight;
}

function envoyerMessage() {
    const i = document.getElementById('chat-input');
    activeConnections.forEach(c => { if(c.open) c.send(`${userName}: ${i.value}`); });
    addChat(i.value, 'moi'); i.value = "";
}

init();