const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const mainContainer = document.getElementById('main-container');
const chatBox = document.getElementById('chat-box');
const studentListContainer = document.getElementById('student-list');

let localStream, peer, isProfessor = false, userName = "";
let activeConnections = [], studentStreams = {}, connectedStudents = [];
let windowOffset = 0, micEnabled = true, handRaised = false;
let mediaRecorder, recordedChunks = [];

// INITIALISATION AVEC SERVEURS STUN POUR CONNEXION DISTANTE
async function init() {
    userName = prompt("Nom complet :") || "Étudiant";
    document.getElementById('display-name').innerText = userName;
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localVideo.srcObject = localStream;

        // CONFIGURATION TECHNIQUE RÉSEAU (STUN)
        peer = new Peer({
            config: {
                'iceServers': [
                    { url: 'stun:stun.l.google.com:19302' },
                    { url: 'stun:stun1.l.google.com:19302' },
                    { url: 'stun:stun2.l.google.com:19302' }
                ]
            }
        });

        peer.on('open', id => document.getElementById('display-id').innerText = "ID: " + id);
        peer.on('call', call => {
            call.answer(localStream);
            call.on('stream', stream => {
                studentStreams[call.peer] = stream;
                if (!isProfessor) remoteVideo.srcObject = stream;
            });
        });
        peer.on('connection', conn => setupData(conn));
    } catch (e) { alert("Erreur média : Veuillez autoriser la caméra et le micro."); }
}

// ENREGISTREMENT D'ÉCRAN
async function toggleRecord() {
    const btn = document.getElementById('btn-record');
    if (!mediaRecorder || mediaRecorder.state === "inactive") {
        try {
            const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
            mediaRecorder = new MediaRecorder(screenStream);
            recordedChunks = [];
            mediaRecorder.ondataavailable = e => { if (e.data.size > 0) recordedChunks.push(e.data); };
            mediaRecorder.onstop = () => {
                const blob = new Blob(recordedChunks, { type: "video/webm" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `BBA-VISIO-Session-${new Date().getTime()}.webm`;
                a.click();
                btn.classList.remove('recording-active');
                btn.innerText = "🔴 REC";
            };
            mediaRecorder.start();
            btn.classList.add('recording-active');
            btn.innerText = "🛑 STOP";
        } catch (err) { console.log("Enregistrement annulé"); }
    } else {
        mediaRecorder.stop();
        mediaRecorder.stream.getTracks().forEach(t => t.stop());
    }
}

function setupData(conn) {
    if (!activeConnections.find(c => c.peer === conn.peer)) activeConnections.push(conn);
    conn.on('open', () => conn.send({ type: "HANDSHAKE", name: userName }));
    conn.on('data', data => {
        if (data.type === "CMD_KICK") {
            alert("Expulsé par le professeur.");
            window.location.reload();
        }
        else if (data.type === "HANDSHAKE" && isProfessor) {
            if (!connectedStudents.find(s => s.id === conn.peer)) {
                connectedStudents.push({ id: conn.peer, name: data.name, hand: false });
            }
            renderStudentList();
        }
        else if (data.type === "HAND_RAISE" && isProfessor) {
            const s = connectedStudents.find(x => x.id === data.peerId);
            if (s) s.hand = true;
            renderStudentList();
        }
        else if (data.type === "HAND_DOWN" && isProfessor) {
            const s = connectedStudents.find(x => x.id === data.peerId);
            if (s) s.hand = false;
            renderStudentList();
            fermerFenetre(data.peerId);
        }
        else if (data.type === "CMD_MUTE") {
            localStream.getAudioTracks()[0].enabled = false;
            document.getElementById('btn-mic').classList.replace('bg-blue-600', 'bg-red-600');
            document.getElementById('btn-mic').innerText = "🎤 MICRO OFF";
        }
        else if (data.type === "PPT_ON") {
            document.getElementById('ppt-frame').src = data.url;
            document.getElementById('ppt-frame').classList.remove('hidden');
        }
        // NOUVEAU : Réception ordre fermeture doc
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
        document.getElementById('local-wrapper').style.display = "block";
        document.getElementById('local-wrapper').style.zIndex = "100";
        activeConnections.forEach(c => { if(c.open) c.send(data); });
    };
    reader.readAsDataURL(input.files[0]);
}

// NOUVEAU : Fonction pour arrêter le partage
function fermerDocument() {
    document.getElementById('ppt-frame').classList.add('hidden');
    document.getElementById('ppt-frame').src = "";
    activeConnections.forEach(c => { if(c.open) c.send({ type: "PPT_OFF" }); });
}

function devenirProf() {
    if (prompt("Code Admin :") === "BBA2026") {
        isProfessor = true;
        document.getElementById('admin-panel').classList.remove('hidden');
        document.getElementById('chat-ui').classList.add('hidden');
        remoteVideo.srcObject = localStream;
        document.getElementById('local-wrapper').style.display = "none";
        renderStudentList();
    }
}

// -- FONCTIONS UTILITAIRES --
function makeDraggable(el) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    const header = el.querySelector('.window-header');
    header.onmousedown = (e) => {
        pos3 = e.clientX; pos4 = e.clientY;
        document.onmouseup = () => { document.onmouseup = null; document.onmousemove = null; };
        document.onmousemove = (e) => {
            pos1 = pos3 - e.clientX; pos2 = pos4 - e.clientY;
            pos3 = e.clientX; pos4 = e.clientY;
            el.style.top = (el.offsetTop - pos2) + "px";
            el.style.left = (el.offsetLeft - pos1) + "px";
        };
    };
}

function accepterEtudiant(id, name) {
    if (!studentStreams[id] || document.getElementById(`win-${id}`)) return;
    const win = document.createElement('div');
    win.id = `win-${id}`; win.className = "student-window";
    win.style.top = (80 + windowOffset) + "px"; win.style.left = (80 + windowOffset) + "px";
    windowOffset = (windowOffset + 30) % 150;
    win.innerHTML = `<div class="window-header"><span class="text-[9px] font-bold text-white">${name}</span><button onclick="fermerFenetre('${id}')">✕</button></div><video id="vid-${id}" autoplay playsinline></video>`;
    mainContainer.appendChild(win);
    document.getElementById(`vid-${id}`).srcObject = studentStreams[id];
    makeDraggable(win);
}

function renderStudentList() {
    if (!studentListContainer) return;
    studentListContainer.innerHTML = "";
    connectedStudents.forEach(s => {
        studentListContainer.innerHTML += `
            <div class="bg-gray-800 p-3 rounded-xl border-l-4 ${s.hand ? 'border-orange-500' : 'border-blue-600'}">
                <div class="flex justify-between items-center mb-2"><span class="text-xs font-bold text-white">${s.name}</span>${s.hand ? '✋' : ''}</div>
                <div class="flex flex-col gap-2">
                    ${s.hand ? `<button onclick="accepterEtudiant('${s.id}', '${s.name}')" class="bg-green-600 py-1 rounded text-[10px] font-bold">VOIR</button>` : ''}
                    <div class="flex gap-1">
                        <button onclick="adminAction('${s.id}', 'CMD_MUTE')" class="flex-1 bg-gray-700 py-1 rounded text-[9px]">MUTE</button>
                        <button onclick="adminAction('${s.id}', 'CMD_KICK')" class="flex-1 bg-gray-700 py-1 rounded text-[9px]">KICK</button>
                    </div>
                </div>
            </div>`;
    });
}

function rejoindreCours() {
    const profId = document.getElementById('target-id').value;
    if (!profId) return;
    const conn = peer.connect(profId);
    setupData(conn);
    const call = peer.call(profId, localStream);
    call.on('stream', s => { remoteVideo.srcObject = s; });
}

function leverMain() {
    handRaised = !handRaised;
    document.getElementById('btn-hand').classList.toggle('bg-orange-600', handRaised);
    activeConnections.forEach(c => { if(c.open) c.send({ type: handRaised ? "HAND_RAISE" : "HAND_DOWN", peerId: peer.id }); });
}

function toggleMic() {
    micEnabled = !micEnabled;
    localStream.getAudioTracks()[0].enabled = micEnabled;
    document.getElementById('btn-mic').classList.toggle('bg-blue-600', micEnabled);
    document.getElementById('btn-mic').classList.toggle('bg-red-600', !micEnabled);
}

function fermerFenetre(id) { document.getElementById(`win-${id}`)?.remove(); }
function adminAction(id, type) {
    const conn = activeConnections.find(c => c.peer === id);
    if (conn && conn.open) {
        conn.send({ type: type });
        if (type === "CMD_KICK") {
            connectedStudents = connectedStudents.filter(s => s.id !== id);
            renderStudentList();
            fermerFenetre(id);
        }
    }
}
function envoyerMessage() {
    const i = document.getElementById('chat-input');
    activeConnections.forEach(c => { if(c.open) c.send(`${userName}: ${i.value}`); });
    addChat(i.value, 'moi'); i.value = "";
}
function addChat(m, t) {
    const d = document.createElement('div');
    d.className = t === 'moi' ? "bg-blue-600 ml-auto p-2 rounded-lg max-w-[80%]" : "bg-gray-800 p-2 rounded-lg max-w-[80%]";
    d.innerText = m; chatBox.appendChild(d); chatBox.scrollTop = chatBox.scrollHeight;
}

init();