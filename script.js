const DB_KEY = 'exam_db_v7';
let editor = null;
let currentStudent = null;
let examActive = false;
let allowFocusLoss = false;
let isMouseInsideExam = false;
let currentMode = 'python';
let audioCtx = null;
let currentFontSize = 14;
let pyodideInstance = null;


function dbGetAll() { try { const d = localStorage.getItem(DB_KEY); return d ? JSON.parse(d) : {}; } catch (e) { return {}; } }
function dbSave(d) { try { localStorage.setItem(DB_KEY, JSON.stringify(d)); } catch (e) { alert("Storage full or blocked."); } }
function clearAllData() { if(confirm("Clear all records?")) { localStorage.removeItem(DB_KEY); renderMonitorTable(); } }



function initMonaco() {
    require.config({ paths: { 'vs': 'https://unpkg.com/monaco-editor@0.45.0/min/vs' } });
    require(["vs/editor/editor.main"], function () {
        monaco.editor.defineTheme('dark', { base: 'vs-dark', inherit: true, rules: [], colors: { 'editor.background': '#0f172a' } });
        editor = monaco.editor.create(document.getElementById('editorContainer'), {
            value: getCodeTemplate('python'),
            language: 'python',
            theme: 'dark',
            automaticLayout: true,
            fontSize: currentFontSize,
            minimap: { enabled: false }
        });
        document.getElementById('statusText').innerText = "Ready";
        document.getElementById('statusDot').style.backgroundColor = "#22c55e";
        document.getElementById('studentLoginBtn').disabled = false;
        document.getElementById('studentLoginBtn').innerText = "Start Exam";
        loadPython();
    });
}
window.onload = initMonaco;

function getCodeTemplate(lang) {
    const t = {
        python: `# Python Code\nprint("Hello World")`,
        java: `public class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello World");\n    }\n}`,
        c: `#include <stdio.h>\nint main() {\n    printf("Hello World");\n    return 0;\n}`,
        cpp: `#include <iostream>\nusing namespace std;\nint main() {\n    cout << "Hello World";\n    return 0;\n}`,
        web: `<!DOCTYPE html>\n<html>\n<head>\n    <style>\n        body { font-family: sans-serif; background: #f0f0f0; text-align: center; padding: 50px; }\n        h1 { color: #333; }\n    </style>\n</head>\n<body>\n    <h1>Hello World</h1>\n    <button onclick="alert('JS Works!')">Click Me</button>\n</body>\n</html>`
    };
    return t[lang] || '';
}


function initAudio() {
    if (!audioCtx) {
        try {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) { console.log("Audio not supported"); }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}

function playLoginBeep() {
    if (!audioCtx) return;
    try {
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.connect(g);
        g.connect(audioCtx.destination);
        
       
        o.type = 'sine';
        o.frequency.setValueAtTime(880, audioCtx.currentTime); 
        
        g.gain.setValueAtTime(0.0, audioCtx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.2); 
        o.start();
        o.stop(audioCtx.currentTime + 0.2);
    } catch (e) {}
}

function playErrorBeep() {
    if (!audioCtx) return;
    try {
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.connect(g);
        g.connect(audioCtx.destination);
        
        
        o.type = 'square';
        o.frequency.setValueAtTime(150, audioCtx.currentTime); 
        
        g.gain.setValueAtTime(0.2, audioCtx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 1.5); 
        
        o.start();
        o.stop(audioCtx.currentTime + 1.5);
    } catch (e) {}
}


function attemptLogin() {
    
    initAudio();

    const name = document.getElementById('sName').value.trim();
    const reg = document.getElementById('sReg').value.trim();
    if (!name || !reg) { alert("Enter Name and Reg No"); return; }

    currentStudent = { name: name, reg: reg, entryTime: new Date().toLocaleTimeString(), exitTime: "-", warnings: 0, status: "Active" };
    const allData = dbGetAll();
    allData[reg] = currentStudent;
    dbSave(allData);

    document.getElementById('displaySName').innerText = name;
    document.getElementById('displaySReg').innerText = reg;

    
    playLoginBeep();

    
    switchScreen('examScreen');
    switchMode();
    examActive = true;
    startTimer();
    startMonitoring();
}


function examinerLogin() {
    const id = document.getElementById('eName').value;
    const pass = document.getElementById('ePass').value;
    if(id && pass) {
        switchScreen('examinerDashboard');
        renderMonitorTable();
        setInterval(renderMonitorTable, 2000);
    } else {
        alert("Enter credentials");
    }
}

function renderMonitorTable() {
    const tbody = document.getElementById('monitorTableBody');
    if(!tbody) return;
    const data = dbGetAll();
    tbody.innerHTML = "";
    for (const key in data) {
        const s = data[key];
        const isWarn = s.warnings > 0;
        tbody.innerHTML += `<tr>
            <td>${s.name || 'N/A'}</td>
            <td>${s.reg || 'N/A'}</td>
            <td>${s.entryTime || 'N/A'}</td>
            <td>${s.exitTime || 'N/A'}</td>
            <td><span class="badge ${isWarn ? 'badge-warn' : 'badge-safe'}">${isWarn ? 'Warn' : 'Safe'}</span></td>
            <td>${s.warnings || 0}</td>
        </tr>`;
    }
    if (Object.keys(data).length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px; color:#64748b;">No records found</td></tr>';
    }
}


function startMonitoring() {
    const ec = document.getElementById('examContainer');
    const mb = document.getElementById('mainMenuBar');
    
    ec.addEventListener('mouseenter', () => isMouseInsideExam = true);
    ec.addEventListener('mouseleave', () => isMouseInsideExam = false);
    mb.addEventListener('mouseenter', () => isMouseInsideExam = true);
    mb.addEventListener('mouseleave', () => isMouseInsideExam = false);

    document.addEventListener('visibilitychange', () => {
        if (document.hidden && examActive) triggerViolation("TAB_SWITCH");
    });
    window.addEventListener('blur', () => {
        if (allowFocusLoss || isMouseInsideExam || !examActive) return;
        triggerViolation("WINDOW_SWITCH");
    });
}

function triggerViolation(type) {
    playErrorBeep(); 
    document.getElementById('overlay').style.display = 'flex';
    
    if (currentStudent) {
        currentStudent.warnings++;
        const all = dbGetAll();
        all[currentStudent.reg] = currentStudent;
        dbSave(all);
    }
    
    document.getElementById('warnCountDisplay').innerText = "Warnings: " + (currentStudent ? currentStudent.warnings : 0);
    const b = document.getElementById('statusBadge');
    b.className = "status-badge status-warn";
    b.innerText = "! " + type;
}

function resumeExam() {
    document.getElementById('overlay').style.display = 'none';
    const b = document.getElementById('statusBadge');
    b.className = "status-badge status-active";
    b.innerText = "● Monitoring Active";
    window.focus();
}


function ensureOutputPanel() {
    const panel = document.getElementById('outputPanel');
    if (panel.querySelector('#webPreview')) {
        panel.innerHTML = `<div class="output-header"><span>Output Console</span><button class="close-btn" onclick="clearOutput()">×</button></div><div id="output" class="output-content">Ready...</div>`;
    }
}

async function runCode() {
    const code = editor.getValue();
    const btn = document.getElementById('runBtn');
    btn.disabled = true;

    try {
        let res = "";
        if (currentMode === 'web') {
            const panel = document.getElementById('outputPanel');
            panel.innerHTML = `<div class="output-header"><span>Web Preview</span><button class="close-btn" onclick="clearOutput()">×</button></div><iframe id="webPreview"></iframe>`;
            const iframe = document.getElementById('webPreview');
            iframe.srcdoc = code;
        } else {
            ensureOutputPanel();
            const out = document.getElementById('output');
            out.innerText = "Running...";
            out.style.color = "var(--warning)";

            if (currentMode === 'python') res = await runPython(code);
            else res = await runAPI(code, currentMode);
            
            out.innerText = res;
            out.style.color = "var(--success)";
        }
    } catch (e) {
        ensureOutputPanel();
        const out = document.getElementById('output');
        out.innerText = "Error: " + e.message;
        out.style.color = "var(--danger)";
    }
    btn.disabled = false;
}

async function runPython(code) {
    if (!pyodideInstance) return "Python loading... try again in 5s.";
    try {
        await pyodideInstance.runPythonAsync(`import sys; import io; sys.stdout = io.StringIO(); sys.stderr = io.StringIO()`);
        await pyodideInstance.runPythonAsync(code);
        const stdout = await pyodideInstance.runPythonAsync("sys.stdout.getvalue()");
        const stderr = await pyodideInstance.runPythonAsync("sys.stderr.getvalue()");
        return stdout || stderr || "Done";
    } catch(e) { return "Python Error: " + e.message; }
}

async function runAPI(code, lang) {
    if (window.location.protocol === 'file:') return "Error: Run via Live Server (http)";
    const map = { java: 'java', c: 'c', cpp: 'cpp' };
    const res = await fetch('https://onecompiler.com/api/v1/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language: map[lang], files: [{ name: 'main.' + (lang === 'java' ? 'java' : lang), content: code }] })
    });
    const data = await res.json();
    return data.stdout || data.stderr || "No output";
}

async function loadPython() {
    if (typeof loadPyodide === 'undefined') {
        const script = document.createElement('script');
        script.src = "https://cdn.jsdelivr.net/pyodide/v0.24.1/full/pyodide.js";
        document.head.appendChild(script);
        await new Promise(r => script.onload = r);
    }
    pyodideInstance = await loadPyodide({ indexURL: "https://cdn.jsdelivr.net/pyodide/v0.24.1/full/" });
}


function switchScreen(id) { document.querySelectorAll('.screen').forEach(s => s.classList.remove('active')); document.getElementById(id).classList.add('active'); }
function showExaminerLogin() { switchScreen('examinerLoginScreen'); }
function showStudentLogin() { switchScreen('loginScreen'); }
function logout() { showExaminerLogin(); }

// FIXED FUNCTION
function studentLogout() { 
    examActive = false; // Stops monitoring so alert doesn't trigger beep
    if(currentStudent) { 
        currentStudent.exitTime = new Date().toLocaleTimeString(); 
        const all = dbGetAll(); 
        all[currentStudent.reg] = currentStudent; 
        dbSave(all); 
    }
    alert("Session Saved"); 
    location.reload(); 
}

function menuCmd(cb) { allowFocusLoss = true; cb(); setTimeout(() => allowFocusLoss = false, 300); }

function zoomIn() { currentFontSize += 2; if(editor) editor.updateOptions({ fontSize: currentFontSize }); }
function zoomOut() { if(currentFontSize > 8) { currentFontSize -= 2; if(editor) editor.updateOptions({ fontSize: currentFontSize }); } }

function newFile() { ensureOutputPanel(); editor.setValue(getCodeTemplate(currentMode)); }
function saveFile() { const a = document.createElement('a'); a.href = 'data:text/plain;charset=utf-8,' + encodeURIComponent(editor.getValue()); a.download = 'code.txt'; a.click(); }
function openFileClick() { document.getElementById('fileOpener').click(); }
function readSingleFile(inp) { if(!inp.files[0]) return; const r = new FileReader(); r.onload = (e) => editor.setValue(e.target.result); r.readAsText(inp.files[0]); }
function editUndo() { editor.trigger('keyboard', 'undo'); }
function editRedo() { editor.trigger('keyboard', 'redo'); }
function clearOutput() { const out = document.getElementById('output'); if(out) out.innerText = ""; }

function switchMode() { 
    ensureOutputPanel();
    const l = document.getElementById('langSelect').value; 
    currentMode = l; 
    let langId = l;
    if (l === 'py' || l === 'python') langId = 'python';
    else if (l === 'web') langId = 'html';
    monaco.editor.setModelLanguage(editor.getModel(), langId); 
    editor.setValue(getCodeTemplate(l)); 
}

let timeRemaining = 3600;
function startTimer() {
    setInterval(() => {
        if(timeRemaining > 0 && examActive) {
            timeRemaining--;
            const m = Math.floor(timeRemaining/60);
            const s = timeRemaining%60;
            document.getElementById('timer').innerText = m + ":" + (s<10?"0":"") + s;
        }
    }, 1000);
}
