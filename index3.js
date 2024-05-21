'use strict';

const heygen_API = {
  apiKey: 'ZTFkYTMzZDNkNzM5NDgwZDgwMjRhOTk4OTAwOTRmN2EtMTcxNjI1MzE2Ng==',
  serverUrl: 'https://api.heygen.com',
};

const statusElement = document.querySelector('#status');
const apiKey = heygen_API.apiKey;
const SERVER_URL = heygen_API.serverUrl;

if (apiKey === 'YourApiKey' || SERVER_URL === '') {
  alert('Please enter your API key and server URL in the api.json file');
}

let sessionInfo = null;
let peerConnection = null;
let recognition = null;
let recognizing = false;

function updateStatus(statusElement, message) {
  statusElement.innerHTML += message + '<br>';
  statusElement.scrollTop = statusElement.scrollHeight;
}

updateStatus(statusElement, 'Please click the new button to create the stream first.');

function onMessage(event) {
  const message = event.data;
  console.log('Received message:', message);
}

async function talkToOpenAI(prompt) {
  const response = await fetch(`http://localhost:3000/openai/complete`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ prompt }),
  });
  if (response.status === 500) {
    console.error('Server error');
    updateStatus(statusElement, 'Server Error. Please make sure to set the OpenAI API key.');
    throw new Error('Server error');
  } else {
    const data = await response.json();
    return data.text;
  }
}

async function repeat(session_id, text) {
  const response = await fetch(`${SERVER_URL}/v1/streaming.task`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': apiKey,
    },
    body: JSON.stringify({ session_id, text }),
  });
  if (response.status === 500) {
    console.error('Server error');
    updateStatus(
      statusElement,
      'Server Error. Please ask the staff if the service has been turned on',
    );
    throw new Error('Server error');
  } else {
    const data = await response.json();
    return data.data;
  }
}

async function createNewSession() {
  updateStatus(statusElement, 'Creating new session... please wait');

  const avatar = document.querySelector('#avatarID').value;
  const voice = document.querySelector('#voiceID').value;

  sessionInfo = await newSession('low', avatar, voice);
  const { sdp: serverSdp, ice_servers2: iceServers } = sessionInfo;

  peerConnection = new RTCPeerConnection({ iceServers: iceServers });

  peerConnection.ontrack = (event) => {
    console.log('Received the track');
    if (event.track.kind === 'audio' || event.track.kind === 'video') {
      mediaElement.srcObject = event.streams[0];
    }
  };

  peerConnection.ondatachannel = (event) => {
    const dataChannel = event.channel;
    dataChannel.onmessage = onMessage;
  };

  const remoteDescription = new RTCSessionDescription(serverSdp);
  await peerConnection.setRemoteDescription(remoteDescription);

  updateStatus(statusElement, 'Session creation completed');
  updateStatus(statusElement, 'Now.You can click the start button to start the stream');
}

const fileInput = document.querySelector('#fileInput');
const uploadBtn = document.querySelector('#uploadBtn');
const queryInput = document.querySelector('#queryInput');
const queryBtn = document.querySelector('#queryBtn');
const queryResult = document.querySelector('#queryResult');
const voiceQueryBtn = document.querySelector('#voiceQueryBtn');
const voiceTaskBtn = document.querySelector('#voiceTaskBtn');

let uploadedFileContent = '';

uploadBtn.addEventListener('click', () => {
  const file = fileInput.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      uploadedFileContent = e.target.result;
      updateStatus(statusElement, 'File uploaded successfully.');
    };
    reader.readAsText(file);
  } else {
    alert('Please select a file to upload.');
  }
});

queryBtn.addEventListener('click', async () => {
  const query = queryInput.value;
  if (!uploadedFileContent) {
    alert('Please upload a document first.');
    return;
  }
  if (!query.trim()) {
    alert('Please enter a query.');
    return;
  }

  updateStatus(statusElement, 'Querying document... please wait');

  try {
    const combinedPrompt = `Document: ${uploadedFileContent}\n\nQuery: ${query}\n\nAnswer:`;
    const aiResponse = await talkToOpenAI(combinedPrompt);

    if (sessionInfo) {
      const resp = await repeat(sessionInfo.session_id, aiResponse);
      queryResult.innerHTML = `<p>Query Result: ${resp}</p>`;
    } else {
      queryResult.innerHTML = `<p>Query Result: ${aiResponse}</p>`;
    }

    updateStatus(statusElement, 'Query completed successfully.');
  } catch (error) {
    console.error('Error querying document:', error);
    updateStatus(statusElement, 'Error querying document.');
  }
});

function startVoiceRecognition(inputElement) {
  if (!('webkitSpeechRecognition' in window)) {
    alert('Your browser does not support speech recognition. Please try Chrome.');
    return;
  }

  if (recognition && recognizing) {
    recognition.stop();
    return;
  }

  recognition = new webkitSpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.lang = 'en-US';

  recognition.onstart = () => {
    recognizing = true;
    updateStatus(statusElement, 'Voice recognition started. Speak now...');
  };

  recognition.onresult = (event) => {
    recognizing = false;
    const transcript = event.results[0][0].transcript;
    inputElement.value = transcript;
    updateStatus(statusElement, 'Voice recognition result: ' + transcript);
  };

  recognition.onerror = (event) => {
    recognizing = false;
    console.error('Voice recognition error:', event.error);
    updateStatus(statusElement, 'Voice recognition error: ' + event.error);
  };

  recognition.onend = () => {
    recognizing = false;
    updateStatus(statusElement, 'Voice recognition ended.');
  };

  recognition.start();
}

voiceQueryBtn.addEventListener('click', () => {
  startVoiceRecognition(queryInput);
});

voiceTaskBtn.addEventListener('click', () => {
  startVoiceRecognition(document.querySelector('#taskInput'));
});

document.querySelector('#newBtn').addEventListener('click', createNewSession);
document.querySelector('#startBtn').addEventListener('click', startAndDisplaySession);
document.querySelector('#repeatBtn').addEventListener('click', repeatHandler);
document.querySelector('#closeBtn').addEventListener('click', closeConnectionHandler);
document.querySelector('#talkBtn').addEventListener('click', talkHandler);

async function startAndDisplaySession() {
  if (!sessionInfo) {
    updateStatus(statusElement, 'Please create a connection first');
    return;
  }

  updateStatus(statusElement, 'Starting session... please wait');

  const localDescription = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(localDescription);

  peerConnection.onicecandidate = ({ candidate }) => {
    console.log('Received ICE candidate:', candidate);
    if (candidate) {
      handleICE(sessionInfo.session_id, candidate.toJSON());
    }
  };

  peerConnection.oniceconnectionstatechange = (event) => {
    updateStatus(
      statusElement,
      `ICE connection state changed to: ${peerConnection.iceConnectionState}`,
    );
  };

  await startSession(sessionInfo.session_id, localDescription);

  var receivers = peerConnection.getReceivers();
  
  receivers.forEach((receiver) => {
    receiver.jitterBufferTarget = 500;
  });

  updateStatus(statusElement, 'Session started successfully');
}

async function handleICE(session_id, candidate) {
  const response = await fetch(`${SERVER_URL}/v1/streaming.ice`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': apiKey,
    },
    body: JSON.stringify({ session_id, candidate }),
  });
  if (response.status === 500) {
    console.error('Server error');
    updateStatus(
      statusElement,
      'Server Error. Please ask the staff if the service has been turned on',
    );
    throw new Error('Server error');
  } else {
    const data = await response.json();
    return data;
  }
}

async function startSession(session_id, sdp) {
  const response = await fetch(`${SERVER_URL}/v1/streaming.start`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': apiKey,
    },
    body: JSON.stringify({ session_id, sdp }),
  });
  if (response.status === 500) {
    console.error('Server error');
    updateStatus(
      statusElement,
      'Server Error. Please ask the staff if the service has been turned on',
    );
    throw new Error('Server error');
  } else {
    const data = await response.json();
    return data.data;
  }
}

async function newSession(quality, avatar_name, voice_id) {
  const response = await fetch(`${SERVER_URL}/v1/streaming.new`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': apiKey,
    },
    body: JSON.stringify({
      quality,
      avatar_name,
      voice: {
        voice_id: voice_id,
      },
    }),
  });
  if (response.status === 500) {
    console.error('Server error');
    updateStatus(
      statusElement,
      'Server Error. Please ask the staff if the service has been turned on',
    );
    throw new Error('Server error');
  } else {
    const data = await response.json();
    console.log(data.data);
    return data.data;
  }
}

async function repeatHandler() {
  if (!sessionInfo) {
    updateStatus(statusElement, 'Please create a connection first');
    return;
  }
  updateStatus(statusElement, 'Sending task... please wait');
  const text = document.querySelector('#taskInput').value;
  if (text.trim() === '') {
    alert('Please enter a task');
    return;
  }

  const resp = await repeat(sessionInfo.session_id, text);
  updateStatus(statusElement, 'Task sent successfully');
}

async function talkHandler() {
  if (!sessionInfo) {
    updateStatus(statusElement, 'Please create a connection first');
    return;
  }
  const prompt = document.querySelector('#taskInput').value;
  if (prompt.trim() === '') {
    alert('Please enter a prompt for the LLM');
    return;
  }

  updateStatus(statusElement, 'Talking to LLM... please wait');

  try {
    const text = await talkToOpenAI(prompt);

    if (text) {
      const resp = await repeat(sessionInfo.session_id, text);
      updateStatus(statusElement, 'LLM response sent successfully');
    } else {
      updateStatus(statusElement, 'Failed to get a response from AI');
    }
  } catch (error) {
    console.error('Error talking to AI:', error);
    updateStatus(statusElement, 'Error talking to AI');
  }
}

async function closeConnectionHandler() {
  if (!sessionInfo) {
    updateStatus(statusElement, 'Please create a connection first');
    return;
  }

  renderID++;
  hideElement(canvasElement);
  hideElement(bgCheckboxWrap);
  mediaCanPlay = false;

  updateStatus(statusElement, 'Closing connection... please wait');
  try {
    peerConnection.close();
    const resp = await stopSession(sessionInfo.session_id);
    console.log(resp);
  } catch (err) {
    console.error('Failed to close the connection:', err);
  }
  updateStatus(statusElement, 'Connection closed successfully');
}

async function stopSession(session_id) {
  const response = await fetch(`${SERVER_URL}/v1/streaming.stop`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': apiKey,
    },
    body: JSON.stringify({ session_id }),
  });
  if (response.status === 500) {
    console.error('Server error');
    updateStatus(statusElement, 'Server Error. Please ask the staff for help');
    throw new Error('Server error');
  } else {
    const data = await response.json();
    return data.data;
  }
}

const removeBGCheckbox = document.querySelector('#removeBGCheckbox');
removeBGCheckbox.addEventListener('click', () => {
  const isChecked = removeBGCheckbox.checked;

  if (isChecked && !sessionInfo) {
    updateStatus(statusElement, 'Please create a connection first');
    removeBGCheckbox.checked = false;
    return;
  }

  if (isChecked && !mediaCanPlay) {
    updateStatus(statusElement, 'Please wait for the video to load');
    removeBGCheckbox.checked = false;
    return;
  }

  if (isChecked) {
    hideElement(mediaElement);
    showElement(canvasElement);
    renderCanvas();
  } else {
    hideElement(canvasElement);
    showElement(mediaElement);
    renderID++;
  }
});

let renderID = 0;
function renderCanvas() {
  if (!removeBGCheckbox.checked) return;
  hideElement(mediaElement);
  showElement(canvasElement);

  canvasElement.classList.add('show');

  const curRenderID = Math.trunc(Math.random() * 1000000000);
  renderID = curRenderID;

  const ctx = canvasElement.getContext('2d', { willReadFrequently: true });

  if (bgInput.value) {
    canvasElement.parentElement.style.background = bgInput.value?.trim();
  }

  function processFrame() {
    if (!removeBGCheckbox.checked) return;
    if (curRenderID !== renderID) return;

    canvasElement.width = mediaElement.videoWidth;
    canvasElement.height = mediaElement.videoHeight;

    ctx.drawImage(mediaElement, 0, 0, canvasElement.width, canvasElement.height);
    ctx.getContextAttributes().willReadFrequently = true;
    const imageData = ctx.getImageData(0, 0, canvasElement.width, canvasElement.height);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
      const red = data[i];
      const green = data[i + 1];
      const blue = data[i + 2];

      if (isCloseToGreen([red, green, blue])) {
        data[i + 3] = 0;
      }
    }

    ctx.putImageData(imageData, 0, 0);
    requestAnimationFrame(processFrame);
  }

  processFrame();
}

function isCloseToGreen(color) {
  const [red, green, blue] = color;
  return green > 90 && red < 90 && blue < 90;
}

function hideElement(element) {
  element.classList.add('hide');
  element.classList.remove('show');
}

function showElement(element) {
  element.classList.add('show');
  element.classList.remove('hide');
}

const mediaElement = document.querySelector('#mediaElement');
let mediaCanPlay = false;
mediaElement.onloadedmetadata = () => {
  mediaCanPlay = true;
  mediaElement.play();
  showElement(bgCheckboxWrap);
};
const canvasElement = document.querySelector('#canvasElement');
const bgCheckboxWrap = document.querySelector('#bgCheckboxWrap');
const bgInput = document.querySelector('#bgInput');
bgInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    renderCanvas();
  }
});

