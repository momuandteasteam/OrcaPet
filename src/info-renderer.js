const panel = document.querySelector('#panel');
const primary = document.querySelector('#primary');
const secondary = document.querySelector('#secondary');

function render(status) {
  panel.dataset.state = status.state || 'idle';
  if (status.insight) {
    primary.textContent = status.insight.primary;
    secondary.textContent = status.insight.secondary;
  } else {
    primary.textContent = status.detail || 'Orca';
    secondary.textContent = status.source === 'override' ? '外部ステータス' : 'プロセス監視';
  }
}

window.orcaPet.onStatus(render);
window.orcaPet.getInitialState().then((initial) => render(initial.status));
