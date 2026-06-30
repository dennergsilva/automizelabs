// =======================================================
// AutomizeLabs — camada de movimento premium
// Lenis (scroll suave) + GSAP ScrollTrigger (scrub) + three.js (3D de fundo)
// Carregado como ES module via CDN. Degrada com elegância: se algo falhar
// no import, o site continua funcionando (script.js roda independente).
// =======================================================

// three.js como ES module local; gsap/ScrollTrigger/Lenis via <script> UMD
// (carregados no index.html antes deste módulo) → globais window.
import * as THREE from "./vendor/three.module.js";

const { gsap, ScrollTrigger, Lenis } = window;

const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const canvas = document.getElementById("webgl-bg");

// Roda só se as libs carregaram e o usuário não pediu menos movimento.
// Se algo faltar, o site segue normal (script.js é independente).
if (!reduce && gsap && ScrollTrigger && Lenis) {
  gsap.registerPlugin(ScrollTrigger);

  // ---- 1) Scroll suave (Lenis) sincronizado ao ticker do GSAP ----
  const lenis = new Lenis({
    duration: 1.15,
    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    smoothWheel: true,
  });
  lenis.on("scroll", ScrollTrigger.update);
  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);

  // ---- 2) Cena three.js de fundo (o "protagonista" 3D) ----
  if (canvas) {
    const CYAN = new THREE.Color("#00f0ff");
    const GREEN = new THREE.Color("#00ff88");

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x050510, 0.085);

    const camera = new THREE.PerspectiveCamera(
      45,
      window.innerWidth / window.innerHeight,
      0.1,
      100
    );
    camera.position.set(0, 0, 7);

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);

    // Grupo que gira como um todo
    const group = new THREE.Group();
    scene.add(group);

    // 2a) Icosaedro wireframe (deixa o texto legível por cima)
    const ico = new THREE.IcosahedronGeometry(2.1, 1);
    const wire = new THREE.LineSegments(
      new THREE.EdgesGeometry(ico),
      new THREE.LineBasicMaterial({ color: CYAN.clone(), transparent: true, opacity: 0.55 })
    );
    group.add(wire);

    // 2b) Núcleo sólido sutil (brilho central)
    const core = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.55, 0),
      new THREE.MeshBasicMaterial({ color: GREEN.clone(), transparent: true, opacity: 0.18 })
    );
    group.add(core);

    // 2c) Campo de pontos (herda o clima das partículas antigas, agora em 3D)
    const N = 900;
    const positions = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const r = 4 + Math.random() * 7;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);
    }
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const points = new THREE.Points(
      pGeo,
      new THREE.PointsMaterial({ color: CYAN.clone(), size: 0.035, transparent: true, opacity: 0.7 })
    );
    scene.add(points);

    // Loop de render (um único, no ticker do GSAP) + rotação contínua
    const render = (_t, deltaMs) => {
      const d = deltaMs / 1000;
      group.rotation.y += d * 0.12;
      group.rotation.x += d * 0.04;
      points.rotation.y -= d * 0.03;
      renderer.render(scene, camera);
    };
    gsap.ticker.add(render);

    // SCRUB: o 3D reage à rolagem da página inteira
    const colorMix = { t: 0 };
    gsap.timeline({
      scrollTrigger: {
        trigger: document.body,
        start: "top top",
        end: "bottom bottom",
        scrub: 1,
      },
    })
      .to(group.rotation, { z: Math.PI, ease: "none" }, 0)
      .to(group.scale, { x: 1.5, y: 1.5, z: 1.5, ease: "none" }, 0)
      .to(camera.position, { z: 5, ease: "none" }, 0)
      .to(
        colorMix,
        {
          t: 1,
          ease: "none",
          onUpdate: () => {
            const c = CYAN.clone().lerp(GREEN, colorMix.t);
            wire.material.color.copy(c);
            points.material.color.copy(c);
          },
        },
        0
      );

    window.addEventListener("resize", () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  // ---- 3) Parallax cinematográfico do hero (some suave ao rolar) ----
  // .hero-inner é container sem animação CSS própria → não conflita com o line-up.
  gsap.to(".hero-inner", {
    y: -120,
    opacity: 0.15,
    ease: "none",
    scrollTrigger: {
      trigger: ".hero",
      start: "top top",
      end: "bottom top",
      scrub: 1,
    },
  });

  // Recalcula posições após carregar fontes (mudam altura → afeta os triggers)
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => ScrollTrigger.refresh());
  }
  window.addEventListener("load", () => ScrollTrigger.refresh());
}
