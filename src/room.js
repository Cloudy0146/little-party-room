// M2 之前的占位：真正的 3D 房间会在这里加载
export function startRoom(el) {
  el.hidden = false;
  el.innerHTML = '<p class="placeholder">房间施工中（M2）</p>';
}
