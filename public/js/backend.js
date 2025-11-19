// backend.js (client-side JS)

// --- Connect to Socket.io ---
const socket = io();
const roomId = new URLSearchParams(window.location.search).get("room");
if (!roomId) window.location = "lobby.html";

// --- Data structures ---
const pcs = {}; // PeerConnections by peerId
const remoteStreams = {}; // Remote MediaStreams by peerId
const remoteVideos = {}; // Video elements by peerId
const audioAnalyzers = {}; // Audio analysers for active speaker
let localStream;

// --- HTML elements ---
const localVideo = document.getElementById("user-1");
const videosContainer = document.getElementById("videos");
const controls = {
  camera: document.getElementById("camera-btn"),
  mic: document.getElementById("mic-btn"),
  leave: document.getElementById("leave-btn"),
};
const messageContainer = document.getElementById("message-container");
const messageInput = document.getElementById("message-input");
const sendButton = document.getElementById("send-button");

// --- Helper: setup audio analyser ---
function setupAudioAnalyser(stream, peerId) {
  if (!stream || !stream.getAudioTracks().length) return;
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const source = audioCtx.createMediaStreamSource(stream);
  const analyser = audioCtx.createAnalyser();
  analyser.fftSize = 256;
  source.connect(analyser);
  const dataArray = new Uint8Array(analyser.frequencyBinCount);
  audioAnalyzers[peerId] = { analyser, dataArray, source };
}

// --- Init local media ---
async function initLocalStream() {
  localStream = await navigator.mediaDevices.getUserMedia({
    video: true,
    audio: true,
  });
  localVideo.srcObject = localStream;
  localVideo.muted = true; // avoid echo

  // Setup local analyser
  setupAudioAnalyser(localStream, "local");

  // Join room
  socket.emit("join-room", roomId);
}
initLocalStream();

// --- Handle new users ---
socket.on("user-joined", (peerId) => {
  createPeerConnection(peerId, true);
});

// --- Create PeerConnection ---
function createPeerConnection(peerId, isOfferer) {
  if (pcs[peerId]) return;

  const pc = new RTCPeerConnection({
    iceServers: [{ urls: ["stun:stun.l.google.com:19302"] }],
  });
  pcs[peerId] = pc;

  // Remote stream
  const remoteStream = new MediaStream();
  remoteStreams[peerId] = remoteStream;

  // Create remote video element
  const remoteVideo = document.createElement("video");
  remoteVideo.id = `user-${peerId}`;
  remoteVideo.autoplay = true;
  remoteVideo.playsInline = true;
  videosContainer.appendChild(remoteVideo);
  remoteVideo.srcObject = remoteStream;
  remoteVideos[peerId] = remoteVideo;

  // Add local tracks
  localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));

  // Remote tracks
  pc.ontrack = (event) => {
    event.streams[0]
      .getTracks()
      .forEach((track) => remoteStream.addTrack(track));

    // Setup analyser if audio track exists
    if (!audioAnalyzers[peerId] && remoteStream.getAudioTracks().length > 0) {
      setupAudioAnalyser(remoteStream, peerId);
    }
  };

  // ICE candidates
  pc.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit("candidate", { candidate: event.candidate, to: peerId });
    }
  };

  // Offer
  if (isOfferer) {
    pc.createOffer().then((offer) => {
      pc.setLocalDescription(offer);
      socket.emit("offer", { offer, to: peerId });
    });
  }
}

// --- Handle incoming offer ---
socket.on("offer", async ({ offer, from }) => {
  createPeerConnection(from, false);
  const pc = pcs[from];
  await pc.setRemoteDescription(new RTCSessionDescription(offer));
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  socket.emit("answer", { answer, to: from });
});

// --- Handle incoming answer ---
socket.on("answer", async ({ answer, from }) => {
  const pc = pcs[from];
  if (!pc) return;
  await pc.setRemoteDescription(new RTCSessionDescription(answer));
});

// --- Handle ICE candidates ---
socket.on("candidate", async ({ candidate, from }) => {
  const pc = pcs[from];
  if (!pc) return;
  try {
    await pc.addIceCandidate(new RTCIceCandidate(candidate));
  } catch (e) {
    console.error(e);
  }
});

// --- Handle user leaving ---
socket.on("user-left", (peerId) => {
  if (pcs[peerId]) pcs[peerId].close();
  delete pcs[peerId];

  if (remoteVideos[peerId]) remoteVideos[peerId].remove();
  delete remoteVideos[peerId];
  delete remoteStreams[peerId];
  delete audioAnalyzers[peerId];
});

// --- Controls ---
controls.leave.addEventListener("click", () => {
  Object.values(pcs).forEach((pc) => pc.close());
  socket.disconnect();
  window.location = "lobby.html";
});

controls.camera.addEventListener("click", () => {
  const track = localStream.getVideoTracks()[0];
  track.enabled = !track.enabled;
  controls.camera.style.backgroundColor = track.enabled
    ? "rgb(179,102,249,0.9)"
    : "rgb(255,80,80)";
});

controls.mic.addEventListener("click", () => {
  const track = localStream.getAudioTracks()[0];
  track.enabled = !track.enabled;
  controls.mic.style.backgroundColor = track.enabled
    ? "rgb(179,102,249,0.9)"
    : "rgb(255,80,80)";
});

// --- Chat ---
sendButton.addEventListener("click", () => {
  const text = messageInput.value.trim();
  if (!text) return;
  appendMessage("You", text, "sent-message");
  socket.emit("chat-message", { text });
  messageInput.value = "";
});

socket.on("chat-message", ({ text, senderId }) => {
  appendMessage(senderId || "Peer", text, "receiver-bubble");
});

function appendMessage(sender, text, className) {
  const messageEl = document.createElement("div");
  messageEl.classList.add("message");
  const bubble = document.createElement("div");
  bubble.classList.add(className);
  bubble.innerText = `${sender}: ${text}`;
  messageEl.appendChild(bubble);
  messageContainer.appendChild(messageEl);
  messageContainer.scrollTop = messageContainer.scrollHeight;
}

// --- Active speaker detection ---
function detectActiveSpeaker() {
  let maxVolume = 0;
  let activePeer = null;

  Object.entries(audioAnalyzers).forEach(
    ([peerId, { analyser, dataArray }]) => {
      analyser.getByteFrequencyData(dataArray);
      const volume = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
      if (volume > maxVolume) {
        maxVolume = volume;
        activePeer = peerId;
      }
    }
  );

  // Highlight remote videos
  Object.entries(remoteVideos).forEach(([peerId, video]) => {
    video.style.transform = peerId === activePeer ? "scale(1.05)" : "scale(1)";
    video.style.boxShadow =
      peerId === activePeer
        ? "0 0 25px rgba(102,198,255,0.9)"
        : "0 0 12px rgba(0,0,0,0.2)";
  });

  // Highlight local video
  if (localVideo) {
    const localVolume = audioAnalyzers["local"]
      ? audioAnalyzers["local"].dataArray.reduce((a, b) => a + b, 0) /
        audioAnalyzers["local"].dataArray.length
      : 0;
    const isSpeaking = localVolume > maxVolume * 0.8;
    localVideo.style.transform = isSpeaking ? "scale(1.05)" : "scale(1)";
    localVideo.style.boxShadow = isSpeaking
      ? "0 0 25px rgba(179,102,249,0.9)"
      : "0 0 20px rgba(179,102,249,0.7)";
  }

  requestAnimationFrame(detectActiveSpeaker);
}

detectActiveSpeaker();
