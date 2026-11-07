// copy buttons, screenshot lightbox, table-of-contents highlight
document.querySelectorAll('.code').forEach(function (box) {
  var btn = box.querySelector('.copy'); if (!btn) return;
  btn.addEventListener('click', function () {
    var text = box.querySelector('pre').innerText;
    navigator.clipboard.writeText(text).then(function () { btn.textContent = 'Copied'; setTimeout(function () { btn.textContent = 'Copy'; }, 1400); });
  });
});
var lb = document.createElement('div'); lb.className = 'lb'; lb.innerHTML = '<img alt="">'; document.body.appendChild(lb);
lb.addEventListener('click', function () { lb.classList.remove('on'); });
document.querySelectorAll('figure.shot img').forEach(function (img) {
  img.addEventListener('click', function () { lb.querySelector('img').src = img.src; lb.querySelector('img').alt = img.alt; lb.classList.add('on'); });
});
var links = Array.prototype.slice.call(document.querySelectorAll('.toc a'));
if (links.length) {
  var targets = links.map(function (a) { return document.querySelector(a.getAttribute('href')); });
  var onScroll = function () {
    var y = window.scrollY + 120, idx = 0;
    targets.forEach(function (t, i) { if (t && t.offsetTop <= y) idx = i; });
    links.forEach(function (a, i) { a.classList.toggle('on', i === idx); });
  };
  window.addEventListener('scroll', onScroll, { passive: true }); onScroll();
}
