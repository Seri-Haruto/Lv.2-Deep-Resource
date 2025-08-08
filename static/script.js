const canvas = document.getElementById("drawingCanvas");
const ctx = canvas.getContext("2d");
let drawing = false;
let points = [];

canvas.addEventListener("mousedown", (e) => {
    drawing = true;
    points = [];
    ctx.beginPath();
    const pos = getMousePos(e);
    ctx.moveTo(pos.x, pos.y);
    points.push(pos);
});

canvas.addEventListener("mousemove", (e) => {
    if (!drawing) return;
    const pos = getMousePos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    points.push(pos);
});

canvas.addEventListener("mouseup", () => {
    drawing = false;
});

document.getElementById("clearBtn").addEventListener("click", () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    points = [];
});

document.getElementById("submitBtn").addEventListener("click", async () => {
    if (points.length < 3) {
        alert("もう少しぐるぐるを描いてください！");
        return;
    }

    // 🔸自己申告の valence / arousal / user_id を取得
    const valence = parseFloat(document.getElementById("valence").value);
    const arousal = parseFloat(document.getElementById("arousal").value);
    const userId = document.getElementById("userId").value || "anonymous";

    // 🔸送信データ
    const response = await fetch("/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            user_id: userId,
            valence: valence,
            arousal: arousal,
            points: points
        })
    });

    if (response.ok) {
        alert("送信しました！");
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        points = [];
    } else {
        alert("送信に失敗しました");
    }
});

function getMousePos(e) {
    const rect = canvas.getBoundingClientRect();
    return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
    };
}

// 🔸スライダーの値をリアルタイムで表示
const valenceSlider = document.getElementById('valence');
const arousalSlider = document.getElementById('arousal');
const valenceValue = document.getElementById('valence-value');
const arousalValue = document.getElementById('arousal-value');

valenceSlider.addEventListener('input', () => {
    valenceValue.textContent = valenceSlider.value;
});

arousalSlider.addEventListener('input', () => {
    arousalValue.textContent = arousalSlider.value;
});
