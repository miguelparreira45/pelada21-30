const whatsappMessage = "Ola! Quero conhecer o PeladaFast e entender como ele pode organizar minha pelada.";
const whatsappUrl = `https://wa.me/5521974381772?text=${encodeURIComponent(whatsappMessage)}`;

document.querySelectorAll("[data-whatsapp]").forEach((link) => {
  link.href = whatsappUrl;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
});

const menuToggle = document.querySelector("[data-menu-toggle]");
const menuCloseItems = document.querySelectorAll("[data-menu-close], #siteMenu a");

function setMenuOpen(isOpen) {
  document.body.classList.toggle("menu-open", isOpen);
  menuToggle?.setAttribute("aria-expanded", String(isOpen));
}

menuToggle?.addEventListener("click", () => setMenuOpen(!document.body.classList.contains("menu-open")));
menuCloseItems.forEach((item) => item.addEventListener("click", () => setMenuOpen(false)));
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") setMenuOpen(false);
});

const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) entry.target.classList.add("in-view");
  });
}, { threshold: .16 });

document.querySelectorAll(".reveal").forEach((element) => revealObserver.observe(element));

const cards = Array.from(document.querySelectorAll(".orbit-card"));
let activeIndex = 0;

function renderOrbit() {
  cards.forEach((card, index) => {
    const offset = (index - activeIndex + cards.length) % cards.length;
    card.classList.remove("active", "prev", "next", "hidden-card");
    if (offset === 0) card.classList.add("active");
    else if (offset === 1) card.classList.add("next");
    else if (offset === cards.length - 1) card.classList.add("prev");
    else card.classList.add("hidden-card");
  });
}

function moveOrbit(direction) {
  activeIndex = (activeIndex + direction + cards.length) % cards.length;
  renderOrbit();
}

document.querySelector("[data-orbit-prev]")?.addEventListener("click", () => moveOrbit(-1));
document.querySelector("[data-orbit-next]")?.addEventListener("click", () => moveOrbit(1));
renderOrbit();
setInterval(() => moveOrbit(1), 4200);

document.querySelectorAll(".tilt-card").forEach((card) => {
  card.addEventListener("pointermove", (event) => {
    const rect = card.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) - .5;
    const y = ((event.clientY - rect.top) / rect.height) - .5;
    card.style.transform = `rotateY(${x * 10}deg) rotateX(${-y * 10}deg) translateY(-4px)`;
  });

  card.addEventListener("pointerleave", () => {
    card.style.transform = "";
  });
});

const heroVideo = document.querySelector(".hero-video");
window.addEventListener("scroll", () => {
  const progress = Math.min(1, window.scrollY / Math.max(1, window.innerHeight));
  if (heroVideo) {
    heroVideo.style.transform = `translateY(${progress * 34}px) scale(${1 + progress * .035})`;
  }
}, { passive: true });
