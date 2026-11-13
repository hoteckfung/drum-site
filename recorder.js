const ZONE_LETTERS = { 'left-core': 'L', 'right-core': 'R', 'left-rim': 'l', 'right-rim': 'r' };
const CORE_LETTERS = 'RLB';
const MAX_SCORE = 5000;
const IDLE_TEXT = '准备好了就按「开始录」';

const recorder = {
  recording: false,
  raw: [],
  hits: [],
  layout: [],
  shape: null,
  grid: 2,
  beatsPerBar: 4,
  beatLength: 0.75,
  countIn: 4,
  start: 0,
  end: Infinity,
  nextTick: 0,
  tickIndex: 0,
  frame: 0,
  selected: -1,
  target: null,
  row: '',
};
const scoreBox = editor.elements['鼓谱'];
const previewBox = document.getElementById('preview');
const recordButton = document.getElementById('rec-start');
const counter = document.getElementById('rec-counter');
const takeBox = document.getElementById('take');
const takeGrid = document.getElementById('take-grid');
const takeStatus = document.getElementById('take-status');
const tempoInput = document.getElementById('rec-tempo');
const beatsInput = document.getElementById('rec-beats');
const gridInput = document.getElementById('rec-grid');
const offsetInput = document.getElementById('rec-offset');

document.getElementById('rec-rows').onclick = (event) => {
  const button = event.target.closest('[data-rec-row]');
  if (button) {
    setRecordRow(button.dataset.recRow);
  }
};
tempoInput.oninput = showSettings;
gridInput.onchange = resnap;
offsetInput.oninput = () => {
  writeSaved('recordOffset', Number(offsetInput.value));
  showSettings();
  resnap();
};
recordButton.onclick = () => {
  if (recorder.recording) {
    finishRecording();
  } else {
    startRecording();
  }
};
previewBox.onclick = pickTarget;
scoreBox.addEventListener('input', () => setTarget(null));
takeGrid.onclick = (event) => {
  const cell = event.target.closest('[data-slot]');
  if (cell) {
    pickSlot(Number(cell.dataset.slot));
  }
};
document.getElementById('take-left').onclick = () => moveSelected(-1);
document.getElementById('take-right').onclick = () => moveSelected(1);
document.getElementById('take-delete').onclick = deleteSelected;
document.getElementById('take-play').onclick = playTake;
document.getElementById('take-write').onclick = writeTake;

function resetRecorder() {
  stopClock();
  recorder.raw = [];
  recorder.hits = [];
  recorder.selected = -1;
  setTarget(null);
  setRecordRow('');
  offsetInput.value = readSaved('recordOffset', 0);
  showSettings();
  takeBox.hidden = true;
  takeStatus.textContent = '';
  counter.textContent = IDLE_TEXT;
}

function recordHit(zone, time) {
  if (!recorder.recording) {
    return;
  }
  const latency = padAudio.outputLatency || padAudio.baseLatency || 0;
  recorder.raw.push({ letter: ZONE_LETTERS[zone], beats: (time - latency - recorder.start) / recorder.beatLength });
}

function setRecordRow(row) {
  recorder.row = row;
  for (const button of document.querySelectorAll('[data-rec-row]')) {
    button.classList.toggle('on', button.dataset.recRow === row);
  }
  if (!takeBox.hidden) {
    renderTake();
  }
}

function pickTarget(event) {
  const children = [...previewBox.children];
  const index = children.findIndex((child) => child.contains(event.target));
  const block = parseBlocks(scoreBox.value)[index];
  if (!block || (!block.rows && !SCORE_LINE.test(block.line))) {
    return;
  }
  setTarget(recorder.target && recorder.target.index === index ? null : { index, block });
}

function setTarget(target) {
  recorder.target = target;
  [...previewBox.children].forEach((child, index) => child.classList.toggle('target', Boolean(target) && index === target.index));
  beatsInput.disabled = Boolean(target);
  const label = document.getElementById('rec-target');
  if (!target) {
    label.textContent = '写到：鼓谱最后（新的一行）。';
    return;
  }
  const rows = target.block.rows ? `那一组（${target.block.rows.map((row) => `第${row.name}排`).join('、')}）` : '那一行';
  label.textContent = `写到：选中的${rows}，长度跟它一样（${shapeOf(target.block).length} 小节），录完会自己停。再点一次取消。`;
}

function startRecording() {
  const shape = recorder.target ? shapeOf(recorder.target.block) : null;
  if (shape && shape.length === 0) {
    counter.textContent = '选中的这一行没有拍子。';
    return;
  }
  if (document.activeElement) {
    document.activeElement.blur();
  }
  padAudio = padAudio || new AudioContext();
  padAudio.resume();
  recorder.shape = shape;
  recorder.beatsPerBar = shape ? shape[0] : Number(beatsInput.value);
  recorder.beatLength = 60 / Number(tempoInput.value);
  recorder.countIn = recorder.beatsPerBar;
  recorder.raw = [];
  recorder.hits = [];
  recorder.selected = -1;
  takeBox.hidden = true;
  takeStatus.textContent = '';
  const first = padAudio.currentTime + 0.15;
  recorder.start = first + recorder.countIn * recorder.beatLength;
  recorder.end = shape ? recorder.start + sum(shape) * recorder.beatLength : Infinity;
  recorder.nextTick = first;
  recorder.tickIndex = 0;
  recorder.recording = true;
  recordButton.textContent = '■ 停止';
  recorder.frame = requestAnimationFrame(clock);
}

function clock() {
  const now = padAudio.currentTime;
  while (recorder.nextTick < now + 0.3 && recorder.nextTick < recorder.end - 0.01) {
    const accent = beatPosition(recorder.tickIndex - recorder.countIn).beat === 0;
    tone(padAudio, recorder.nextTick, accent ? 2000 : 1400, accent ? 2000 : 1400, 0.03, 0.03, 0.25, 'square');
    recorder.tickIndex += 1;
    recorder.nextTick += recorder.beatLength;
  }
  counter.textContent = counterText(now);
  if (now >= recorder.end + recorder.beatLength / 4) {
    finishRecording();
    return;
  }
  recorder.frame = requestAnimationFrame(clock);
}

function finishRecording() {
  stopClock();
  if (recorder.raw.length === 0) {
    counter.textContent = '没有录到声音，再试一次。';
    return;
  }
  counter.textContent = `录好了：${recorder.raw.length} 下`;
  resnap();
  takeBox.hidden = false;
}

function stopClock() {
  cancelAnimationFrame(recorder.frame);
  recorder.recording = false;
  recordButton.textContent = '● 开始录';
}

function resnap() {
  if (recorder.raw.length === 0) {
    return;
  }
  recorder.grid = Number(gridInput.value);
  const offsetBeats = Number(offsetInput.value) / 1000 / recorder.beatLength;
  const hits = snapHits(recorder.raw, recorder.grid, offsetBeats);
  recorder.layout = recorder.shape || openShape(hits, recorder.grid, recorder.beatsPerBar);
  const total = sum(recorder.layout) * recorder.grid;
  recorder.hits = hits.filter((hit) => hit.slot < total);
  recorder.selected = -1;
  renderTake();
}

function renderTake() {
  const owner = new Map(recorder.hits.map((hit, index) => [hit.slot, index]));
  let slot = 0;
  takeGrid.innerHTML = recorder.layout
    .map((beats) => {
      const beatCells = [];
      for (let beat = 0; beat < beats; beat++) {
        const cells = [];
        for (let part = 0; part < recorder.grid; part++) {
          const index = owner.get(slot);
          cells.push(
            index === undefined
              ? `<span class="slot empty" data-slot="${slot}"></span>`
              : `<span class="slot${index === recorder.selected ? ' sel' : ''}" data-slot="${slot}">${renderHit(recorder.hits[index].letter)}</span>`
          );
          slot += 1;
        }
        beatCells.push(`<span class="take-beat">${cells.join('')}</span>`);
      }
      return `<div class="take-bar">${beatCells.join('')}</div>`;
    })
    .join('');
  document.getElementById('take-text').textContent = takeLine();
}

function pickSlot(slot) {
  const index = recorder.hits.findIndex((hit) => hit.slot === slot);
  if (index >= 0) {
    recorder.selected = index === recorder.selected ? -1 : index;
  } else if (recorder.selected >= 0) {
    recorder.hits[recorder.selected].slot = slot;
  }
  renderTake();
}

function moveSelected(step) {
  const hit = recorder.hits[recorder.selected];
  if (!hit) {
    return;
  }
  const slot = hit.slot + step;
  const total = sum(recorder.layout) * recorder.grid;
  if (slot >= 0 && slot < total && !recorder.hits.some((other) => other.slot === slot)) {
    hit.slot = slot;
    renderTake();
  }
}

function deleteSelected() {
  if (recorder.selected < 0) {
    return;
  }
  recorder.hits.splice(recorder.selected, 1);
  recorder.selected = -1;
  renderTake();
}

function playTake() {
  padAudio = padAudio || new AudioContext();
  padAudio.resume();
  const start = padAudio.currentTime + 0.1;
  const slotLength = recorder.beatLength / recorder.grid;
  for (const hit of recorder.hits) {
    const volume = 'Bb'.includes(hit.letter) ? 1 : 0.6;
    if (CORE_LETTERS.includes(hit.letter)) {
      coreSound(padAudio, start + hit.slot * slotLength, volume);
    } else {
      rimSound(padAudio, start + hit.slot * slotLength, volume);
    }
  }
}

function writeTake() {
  const result = applyTake(scoreBox.value, recorder.target && recorder.target.block, recorder.row, takeText(recorder.hits, recorder.layout, recorder.grid));
  if (result.error) {
    takeStatus.textContent = result.error;
    return;
  }
  if (result.text.length > MAX_SCORE) {
    takeStatus.textContent = `鼓谱会超过 ${MAX_SCORE} 字，写不进去。`;
    return;
  }
  scoreBox.value = result.text;
  scoreBox.dispatchEvent(new Event('input', { bubbles: true }));
  takeStatus.textContent = '已写进鼓谱。记得按「保存」。';
}

function takeLine() {
  const body = takeText(recorder.hits, recorder.layout, recorder.grid);
  return recorder.row ? `${recorder.row}: ${body}` : body;
}

function counterText(now) {
  const elapsed = (now - recorder.start) / recorder.beatLength;
  if (elapsed < 0) {
    return `预备 ${Math.max(1, Math.floor(elapsed + recorder.countIn) + 1)}`;
  }
  const position = beatPosition(Math.floor(elapsed));
  const total = recorder.shape ? ` / ${recorder.shape.length}` : '';
  return `第 ${position.bar + 1}${total} 小节 · ${position.beat + 1}`;
}

function beatPosition(beatIndex) {
  if (beatIndex < 0) {
    return { bar: -1, beat: beatIndex + recorder.countIn };
  }
  if (!recorder.shape) {
    return { bar: Math.floor(beatIndex / recorder.beatsPerBar), beat: beatIndex % recorder.beatsPerBar };
  }
  let remaining = beatIndex;
  for (let bar = 0; bar < recorder.shape.length; bar++) {
    if (remaining < recorder.shape[bar]) {
      return { bar, beat: remaining };
    }
    remaining -= recorder.shape[bar];
  }
  return { bar: recorder.shape.length - 1, beat: recorder.shape[recorder.shape.length - 1] - 1 };
}

function snapHits(raw, grid, offsetBeats) {
  const slots = new Map();
  for (const hit of raw) {
    const slot = Math.round((hit.beats + offsetBeats) * grid);
    if (slot >= 0) {
      slots.set(slot, slots.has(slot) ? mergeLetters(slots.get(slot), hit.letter) : hit.letter);
    }
  }
  return [...slots].map(([slot, letter]) => ({ slot, letter })).sort((first, second) => first.slot - second.slot);
}

function mergeLetters(first, second) {
  const letters = [...(first + second)];
  const cores = letters.filter((letter) => CORE_LETTERS.includes(letter));
  if (cores.length > 0) {
    return cores.includes('B') || (cores.includes('R') && cores.includes('L')) ? 'B' : cores[0];
  }
  return letters.includes('b') || (letters.includes('r') && letters.includes('l')) ? 'b' : letters[0];
}

function openShape(hits, grid, beatsPerBar) {
  const lastSlot = hits.length > 0 ? hits[hits.length - 1].slot : 0;
  const bars = Math.max(1, Math.ceil((Math.floor(lastSlot / grid) + 1) / beatsPerBar));
  return Array.from({ length: bars }, () => beatsPerBar);
}

function takeText(hits, layout, grid) {
  const letterAt = new Map(hits.map((hit) => [hit.slot, hit.letter]));
  let beatIndex = 0;
  return layout
    .map((beats) => {
      const tokens = [];
      for (let beat = 0; beat < beats; beat++) {
        const slots = Array.from({ length: grid }, (item, part) => letterAt.get(beatIndex * grid + part) || '');
        tokens.push(beatToken(slots));
        beatIndex += 1;
      }
      return tokens.join(' ');
    })
    .join(' | ');
}

function beatToken(slots) {
  if (slots.every((slot) => !slot)) {
    return '-';
  }
  for (let parts = 1; parts <= slots.length; parts++) {
    const step = slots.length / parts;
    if (Number.isInteger(step) && slots.every((slot, index) => !slot || index % step === 0)) {
      return Array.from({ length: parts }, (item, index) => slots[index * step] || '-').join('');
    }
  }
  return slots.map((slot) => slot || '-').join('');
}

function applyTake(text, block, row, body) {
  const line = row ? `${row}: ${body}` : body;
  if (!block) {
    if (!text.trim()) {
      return { text: line };
    }
    return { text: text.endsWith('\n') ? `${text}${line}` : `${text}\n${line}` };
  }
  const lines = text.split('\n');
  if (!block.rows) {
    if (!row || row === '1') {
      lines[block.lineIndex] = line;
    } else {
      lines.splice(block.lineIndex, 1, `1: ${block.line}`, line);
    }
    return { text: lines.join('\n') };
  }
  if (!row) {
    return { error: '这一组是分排写的，请先在上面选要写第几排。' };
  }
  const same = block.rows.find((item) => item.name === row);
  if (same) {
    lines[same.lineIndex] = line;
    return { text: lines.join('\n') };
  }
  const earlier = block.rows.filter((item) => Number(item.name) < Number(row));
  const at = earlier.length > 0 ? Math.max(...earlier.map((item) => item.lineIndex)) + 1 : Math.min(...block.rows.map((item) => item.lineIndex));
  lines.splice(at, 0, line);
  return { text: lines.join('\n') };
}

function shapeOf(block) {
  if (!block.rows) {
    return block.line
      .split('|')
      .map(splitBeats)
      .filter((beats) => beats.length > 0)
      .map((beats) => beats.length);
  }
  const barCount = Math.max(...block.rows.map((row) => row.bars.length));
  return Array.from({ length: barCount }, (item, barIndex) => Math.max(...block.rows.map((row) => (row.bars[barIndex] || []).length)));
}

function showSettings() {
  document.getElementById('rec-bpm').textContent = tempoInput.value;
  document.getElementById('rec-offset-value').textContent = offsetInput.value;
}

function sum(numbers) {
  return numbers.reduce((total, number) => total + number, 0);
}
