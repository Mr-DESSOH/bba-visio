const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const mainContainer = document.getElementById('main-container');
const chatBox = document.getElementById('chat-box');

let localStream, peer, isProfessor = false, userName = "", activeConnections = [];
let studentStreams = {}, connectedStudents = [], windowOffset = 0;

async function init() {
    userName = prompt("Nom et Prénom :") || "Étudiant";
    document.getElementById('display-name').innerText = userName;

    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localVideo.srcObject = localStream;
        
        peer = new Peer();
        peer.on('open', id => document.getElementById('display-id').innerText = "ID: " + id);

        peer.on('call', call => {
            call.answer(localStream);
            call.on('stream', stream => {
                studentStreams[call.peer] = stream;
                // Si l'étudiant reçoit l'appel du prof, il met le prof en grand
                if (!isProfessor) {
                    remoteVideo.srcObject = stream;
                    document.getElementById('main-label').innerText = "DIRECT : PROFESSEUR";
                }
            });
        });

        peer.on('connection', conn => setupData(conn));
    } catch (e) { alert("Caméra inaccessible."); }
}

function setupData(conn) {
    if (!activeConnections.find(c => c.peer === conn.peer)) activeConnections.push(conn);
    conn.on('open', () => conn.send({ type: "HANDSHAKE", name: userName }));

    conn.on('data', data => {
        if (data.type === "HANDSHAKE") {
            if (isProfessor) {
                if (!connectedStudents.find(s => s.id === conn.peer)) {
                    connectedStudents.push({id: conn.peer, name: data.name, hand: false});
                }
                renderList();
            }
        }
        else if (data.type === "HAND_RAISE") {
            if (isProfessor) {
                const s = connectedStudents.find(x => x.id === data.peerId);
                if (s) s.hand = true;
                renderList();
                addChat(`Système: ${data.name} veut parler.`, 'sys');
            }
        }
        else if (data.type === "HAND_DOWN") {
            if (isProfessor) {
                const s = connectedStudents.find(x => x.id === data.peerId);
                if (s) s.hand = false;
                renderList();
                fermerFenetre(data.peerId);
            }
        }
        else if (data.type === "PPT_ON") {
            document.getElementById('ppt-frame').src = data.url;
            document.getElementById('ppt-frame').classList.remove('hidden');
        }
        else if (data.type === "PPT_OFF") {
            document.getElementById('ppt-frame').classList.add('hidden');
        }
        else if (data.type === "CMD_MUTE") {
            localStream.getAudioTracks()[0].enabled = false;
            document.getElementById('btn-mic').classList.replace('bg-blue-600', 'bg-red-600');
        }
        else if (data.type === "CMD_KICK") location.reload();
        else if (typeof data === "string") addChat(data, 'dist');
    });
}

// POINT 1 : REJOINDRE LE PROF
function rejoindreCours() {
    const profId = document.getElementById('target-id').value;
    if (!profId) return;
    
    const conn = peer.connect(profId);
    setupData(conn);
    
    const call = peer.call(profId, localStream);
    call.on('stream', s => {
        remoteVideo.srcObject = s;
        document.getElementById('main-label').innerText = "DIRECT : PROFESSEUR";
    });
}

// POINT 2 : MULTI-FENÊTRES EN CASCADE (PROF)
function accepterEtudiant(id, name) {
    if (!studentStreams[id] || document.getElementById(`win-${id}`)) return;

    const win = document.createElement('div');
    win.id = `win-${id}`;
    win.className = "student-window";
    
    // Calcul de la cascade
    win.style.top = (50 + windowOffset) + "px";
    win.style.left = (50 + windowOffset) + "px";
    windowOffset = (windowOffset + 40) % 200;

    win.innerHTML = `
        <div class="bg-orange-600 px-3 py-1 flex justify-between items-center cursor-move">
            <span class="text-[10px] font-black uppercase text-white">${name}</span>
            <button onclick="fermerFenetre('${id}')" class="text-white font-bold hover:scale-125 transition">✕</button>
        </div>
        <video id="vid-${id}" autoplay playsinline class="bg-black"></video>
    `;

    mainContainer.appendChild(win);
    document.getElementById(`vid-${id}`).srcObject = studentStreams[id];
}

function fermerFenetre(id) {
    const el = document.getElementById(`win-${id}`);
    if (el) el.remove();
}

function renderList() {
    const list = document.getElementById('student-list');
    list.innerHTML = "";
    connectedStudents.forEach(s => {
        list.innerHTML += `
            <div class="bg-gray-800 p-3 rounded-xl border-l-4 ${s.hand ? 'border-orange-500' : 'border-blue-500'}">
                <div class="flex justify-between items-center mb-2">
                    <span class="text-xs font-bold text-white">${s.name}</span>
                    ${s.hand ? '<span class="text-orange-500 text-[10px] font-black animate-pulse">MAIN LEVÉE</span>' : ''}
                </div>
                <div class="flex flex-col gap-2">
                    ${s.hand ? `<button onclick="accepterEtudiant('${s.id}', '${s.name}')" class="bg-green-600 py-1.5 rounded text-[10px] font-bold">Ouvrir Vidéo</button>` : ''}
                    <div class="flex gap-1">
                        <button onclick="adminAction('${s.id}', 'CMD_MUTE')" class="flex-1 bg-gray-700 py-1 rounded text-[9px] hover:bg-orange-700">MUTE</button>
                        <button onclick="adminAction('${s.id}', 'CMD_KICK')" class="flex-1 bg-gray-700 py-1 rounded text-[9px] hover:bg-red-700">KICK</button>
                    </div>
                </div>
            </div>`;
    });
}

// LOGIQUE PROF
function devenirProf() {
    if (prompt("Code :") === "BBA2026") {
        isProfessor = true;
        document.getElementById('admin-panel').classList.remove('hidden');
        document.getElementById('chat-ui').classList.add('hidden');
        // Le prof se voit lui-même en grand
        remoteVideo.srcObject = localStream;
        document.getElementById('main-label').innerText = "VOTRE DIFFUSION (PROFESSEUR)";
        document.getElementById('local-wrapper').style.display = "none";
    }
}

// FONCTIONNALITÉS DE BASE
function adminAction(id, type) {
    const conn = activeConnections.find(c => c.peer === id);
    if (conn) conn.send({ type });
}

function leverMain() {
    handRaised = !handRaised;
    document.getElementById('btn-hand').classList.toggle('bg-orange-600', handRaised);
    activeConnections.forEach(c => c.send({ type: handRaised ? "HAND_RAISE" : "HAND_DOWN", name: userName, peerId: peer.id }));
}

function envoyerMessage() {
    const i = document.getElementById('chat-input');
    if (!i.value) return;
    activeConnections.forEach(c => c.send(`${userName}: ${i.value}`));
    addChat(i.value, 'moi');
    i.value = "";
}

function addChat(m, t) {
    const d = document.createElement('div');
    d.className = t === 'moi' ? "bg-blue-600 ml-auto p-2 rounded-lg max-w-[80%]" : (t === 'sys' ? "text-orange-400 text-center text-[9px]" : "bg-gray-800 p-2 rounded-lg max-w-[80%]");
    d.innerText = m;
    chatBox.appendChild(d);
    chatBox.scrollTop = chatBox.scrollHeight;
}

function partagerFichier(input) {
    const file = input.files[0];
    const reader = new FileReader();
    reader.onload = (e) => {
        const data = { type: "PPT_ON", url: e.target.result };
        document.getElementById('ppt-frame').src = data.url;
        document.getElementById('ppt-frame').classList.remove('hidden');
        activeConnections.forEach(c => c.send(data));
    };
    reader.readAsDataURL(file);
}

init();