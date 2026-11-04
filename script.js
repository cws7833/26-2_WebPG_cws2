const stage = document.querySelector(".stage");
const world = document.querySelector(".world");
const head = document.querySelector(".head");
const bodyOne = document.querySelector(".body-one");
const bodyTwo = document.querySelector(".body-two");
const tail = document.querySelector(".tail");
const tongue = document.querySelector(".tongue");
const tongueFill = document.querySelector(".tongue-fill");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

const HEAD_LENGTH = 86.60254;
const BODY_LENGTH = 200;
const REACH = 160;
const MAX_TURN = Math.PI / 3; // 첫 번째 몸통 기준 좌우 60도 (Math.PI / 6이면 30도)
// 몸통이 따라오기 전에 머리가 충분히 꺾이도록 제한 각도에 맞춰 회전 속도를 정합니다.
const HEAD_TURN_SPEED = MAX_TURN * 8; // 초당 회전량, 단위: 라디안
let width, height, scale;
let heading = 0;
let joints = [];
let target = null;
let attacking = false;
let previousTime = 0;
let keyboardTarget = null;
let escaping = false;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
function angleDifference(angle) {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}
function angleBetween(a, b) {
  return Math.atan2(b.y - a.y, b.x - a.x);
}
function distance(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

// 각 도형의 왼쪽 가운데를 기준점으로 배치합니다.
function place(element, point, angle, thickness) {
  element.style.transform = `translate(${point.x}px, ${point.y - thickness / 2}px) rotate(${angle}rad)`;
}

function draw() {
  const bodyAngle = angleBetween(joints[1], joints[0]);
  const secondAngle = angleBetween(joints[2], joints[1]);
  place(head, joints[0], heading, 100);
  place(bodyOne, joints[1], bodyAngle, 100);
  place(bodyTwo, joints[2], secondAngle, 100);
  place(tail, joints[2], angleBetween(joints[2], joints[3]), 100);
  const tip = {
    x: joints[0].x + Math.cos(heading) * HEAD_LENGTH,
    y: joints[0].y + Math.sin(heading) * HEAD_LENGTH,
  };
  place(tongue, tip, heading, 8);
}

function cancelAttack() {
  attacking = false;
  world.classList.remove("attacking");
  tongue.style.width = `${REACH}px`;
}

function resize() {
  // 화면에 맞춘 기존 크기의 가로·세로를 각각 절반으로 줄입니다.
  const viewportWidth = document.documentElement.clientWidth;
  const viewportHeight = document.documentElement.clientHeight;
  scale = Math.min(1, viewportWidth / 1100, viewportHeight / 650) * 0.5;
  scale = Math.max(0.01, scale);
  width = viewportWidth / scale;
  height = viewportHeight / scale;
  world.style.transform = `scale(${scale})`;
  cancelAttack();
  target = null;
  heading = 0;
  const x = width / 2 + 180;
  const y = height / 2;
  joints = [
    { x, y },
    { x: x - 200, y },
    { x: x - 400, y },
    { x: x - 510, y },
  ];
  keyboardTarget = { x: width / 2, y: height / 2 };
  draw();
}

// 뒤쪽 관절은 앞 관절과 일정한 거리를 유지하면서 따라갑니다.
function followBody(dt) {
  let frontAngle = heading;
  for (let i = 1; i < joints.length; i++) {
    const currentAngle = angleBetween(joints[i], joints[i - 1]);
    // 앞 도형의 회전을 뒤쪽 도형에 서서히 전달합니다.
    const angle =
      currentAngle +
      angleDifference(frontAngle - currentAngle) * Math.min(1, dt * 4);
    const length = i === 3 ? 110 : BODY_LENGTH;
    joints[i].x = joints[i - 1].x - Math.cos(angle) * length;
    joints[i].y = joints[i - 1].y - Math.sin(angle) * length;
    frontAngle = angle;
  }
}

function chooseTarget(x, y) {
  cancelAttack();
  // 제목과 행사 정보를 포함한 화면 전체의 클릭 좌표를 목표로 사용합니다.
  target = { x: clamp(x, 0, width), y: clamp(y, 0, height) };
  escaping = distance(joints[0], target) < HEAD_LENGTH + REACH;
  if (reducedMotion.matches) {
    // 긴 이동 대신 완성된 자세를 즉시 표시합니다.
    heading = target.x >= width / 2 ? 0 : Math.PI;
    joints[0] = {
      x: target.x - Math.cos(heading) * (HEAD_LENGTH + REACH),
      y: target.y,
    };
    for (let i = 1; i < 4; i++) {
      const length = i === 3 ? 110 : BODY_LENGTH;
      joints[i] = {
        x: joints[i - 1].x - Math.cos(heading) * length,
        y: target.y,
      };
    }
    // 경계 근처에서는 화면 안쪽에서 목표를 바라봅니다.
    keepInside();
    draw();
    target = null;
  }
}

function keepInside() {
  // 연결된 도형 전체를 같은 양만큼 옮겨 크기와 연결 관계를 보존합니다.
  const xs = joints.map((point) => point.x);
  const ys = joints.map((point) => point.y);
  xs.push(joints[0].x + Math.cos(heading) * (HEAD_LENGTH + 75));
  ys.push(joints[0].y + Math.sin(heading) * (HEAD_LENGTH + 75));
  const dx =
    Math.max(0, 55 - Math.min(...xs)) -
    Math.max(0, Math.max(...xs) - width + 55);
  const dy =
    Math.max(0, 55 - Math.min(...ys)) -
    Math.max(0, Math.max(...ys) - height + 55);
  joints.forEach((point) => {
    point.x += dx;
    point.y += dy;
  });
}

function attack() {
  attacking = true;
  target = null;
  world.classList.add("attacking");
}

tongueFill.addEventListener("animationend", (event) => {
  if (event.animationName === "strike") {
    cancelAttack();
    draw();
  }
});

function animate(time) {
  const dt = Math.min((time - previousTime) / 1000 || 0, 0.035);
  previousTime = time;
  if (target && !attacking && !reducedMotion.matches) {
    // 가까운 목표는 전진하며 거리를 확보한 뒤 다시 접근합니다.
    if (escaping && distance(joints[0], target) > HEAD_LENGTH + REACH + 60)
      escaping = false;
    const desired = escaping
      ? angleBetween(target, joints[0])
      : angleBetween(joints[0], target);
    const bodyAngle = angleBetween(joints[1], joints[0]);
    const difference = angleDifference(desired - heading);
    const nextHeading =
      heading + clamp(difference, -HEAD_TURN_SPEED * dt, HEAD_TURN_SPEED * dt);
    heading =
      bodyAngle +
      clamp(angleDifference(nextHeading - bodyAngle), -MAX_TURN, MAX_TURN);

    // 목표 방향과 5도 이상 차이 나면 회전 중으로 판단합니다.
    // 회전 중 전진 속도는 유지하고, 방향이 맞으면 2배로 전진합니다.
    const isTurning = Math.abs(angleDifference(desired - heading)) > Math.PI / 36;
    const speed = isTurning ? 190 : 380;
    joints[0].x += Math.cos(heading) * speed * dt;
    joints[0].y += Math.sin(heading) * speed * dt;
    followBody(dt);
    keepInside();
    draw();

    const tip = {
      x: joints[0].x + Math.cos(heading) * HEAD_LENGTH,
      y: joints[0].y + Math.sin(heading) * HEAD_LENGTH,
    };
    const tongueAngle = angleBetween(tip, target);
    const reach = distance(tip, target);
    // 공격 직전 혀만 목표를 정확하게 향하게 하여 끝점이 클릭 좌표에 닿습니다.
    if (
      !escaping &&
      reach <= REACH &&
      Math.abs(angleDifference(tongueAngle - heading)) < 0.15
    ) {
      place(tongue, tip, tongueAngle, 8);
      tongue.style.width = `${reach}px`;
      attack();
    }
  }
  requestAnimationFrame(animate);
}

document.body.addEventListener("click", (event) => {
  chooseTarget(event.clientX / scale, event.clientY / scale);
});

stage.addEventListener("keydown", (event) => {
  const directions = {
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0],
    ArrowUp: [0, -1],
    ArrowDown: [0, 1],
  };
  if (directions[event.key]) {
    event.preventDefault();
    keyboardTarget.x = clamp(
      keyboardTarget.x + directions[event.key][0] * 80,
      0,
      width,
    );
    keyboardTarget.y = clamp(
      keyboardTarget.y + directions[event.key][1] * 80,
      0,
      height,
    );
  } else if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    chooseTarget(keyboardTarget.x, keyboardTarget.y);
  }
});

reducedMotion.addEventListener("change", resize);
new ResizeObserver(resize).observe(document.documentElement);
resize();
requestAnimationFrame(animate);
