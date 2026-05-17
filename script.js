// =======================================================
// AutomizeLabs — interactivity
// =======================================================

(() => {
    'use strict';

    // ---- Year ----
    const yearEl = document.getElementById('year');
    if (yearEl) yearEl.textContent = new Date().getFullYear();

    // ---- Nav scroll state ----
    const nav = document.getElementById('nav');
    const onScroll = () => {
        if (window.scrollY > 24) nav.classList.add('scrolled');
        else nav.classList.remove('scrolled');
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    // ---- Mobile nav toggle ----
    const navToggle = document.getElementById('navToggle');
    const navLinks = document.querySelector('.nav-links');
    if (navToggle && navLinks) {
        const setExpanded = (open) => {
            navLinks.classList.toggle('open', open);
            navToggle.setAttribute('aria-expanded', String(open));
        };
        navToggle.addEventListener('click', () => setExpanded(!navLinks.classList.contains('open')));
        navLinks.querySelectorAll('a').forEach(a => a.addEventListener('click', () => setExpanded(false)));
    }

    // ---- Typed text effect ----
    const typedEl = document.getElementById('typed');
    if (typedEl) {
        const words = ['tempo.', 'energia.', 'foco.', 'resultado.'];
        let wordIdx = 0;
        let charIdx = 0;
        let deleting = false;
        let pauseTicks = 0;

        const tick = () => {
            const current = words[wordIdx];

            if (pauseTicks > 0) {
                pauseTicks--;
                return setTimeout(tick, 80);
            }

            if (!deleting) {
                charIdx++;
                typedEl.textContent = current.slice(0, charIdx);
                if (charIdx === current.length) {
                    deleting = true;
                    pauseTicks = 18;
                }
            } else {
                charIdx--;
                typedEl.textContent = current.slice(0, charIdx);
                if (charIdx === 0) {
                    deleting = false;
                    wordIdx = (wordIdx + 1) % words.length;
                    pauseTicks = 4;
                }
            }

            setTimeout(tick, deleting ? 45 : 90);
        };
        setTimeout(tick, 1600);
    }

    // ---- Number counters ----
    const counters = document.querySelectorAll('.stat-num');
    const animateCount = (el) => {
        const text = el.textContent;
        const match = text.match(/^(\d+)(.*)$/);
        if (!match) return;
        const target = parseInt(match[1], 10);
        const suffix = el.querySelector('span')?.outerHTML || '';
        const duration = 1400;
        const start = performance.now();

        const tick = (now) => {
            const t = Math.min(1, (now - start) / duration);
            const eased = 1 - Math.pow(1 - t, 3);
            const val = Math.round(target * eased);
            el.innerHTML = val + suffix;
            if (t < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    };

    // ---- Intersection observer for reveals + counters ----
    const revealEls = document.querySelectorAll('.service-card, .pillar, .about-terminal, .contact-card, .section-head');
    revealEls.forEach(el => el.classList.add('reveal'));

    const io = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                io.unobserve(entry.target);
            }
        });
    }, { threshold: 0.15 });

    revealEls.forEach(el => io.observe(el));

    let countersTriggered = false;
    const counterIo = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting && !countersTriggered) {
                countersTriggered = true;
                counters.forEach(animateCount);
                counterIo.disconnect();
            }
        });
    }, { threshold: 0.4 });
    counters.forEach(c => counterIo.observe(c));

    // ---- Tilt effect on cards ----
    const tiltEls = document.querySelectorAll('[data-tilt]');
    tiltEls.forEach(el => {
        el.addEventListener('mousemove', (e) => {
            const rect = el.getBoundingClientRect();
            const x = (e.clientX - rect.left) / rect.width - 0.5;
            const y = (e.clientY - rect.top) / rect.height - 0.5;
            el.style.transform = `translateY(-6px) perspective(900px) rotateX(${-y * 4}deg) rotateY(${x * 4}deg)`;
        });
        el.addEventListener('mouseleave', () => {
            el.style.transform = '';
        });
    });

    // ---- Particle canvas ----
    const canvas = document.getElementById('particles');
    if (canvas && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        const ctx = canvas.getContext('2d');
        let particles = [];
        let width, height;

        const resize = () => {
            width = canvas.width = window.innerWidth;
            height = canvas.height = window.innerHeight;
        };
        resize();
        window.addEventListener('resize', resize);

        const COUNT = Math.min(70, Math.floor((window.innerWidth * window.innerHeight) / 22000));
        const COLORS = [
            'rgba(0, 240, 255, ',
            'rgba(0, 255, 136, ',
            'rgba(57, 255, 20, ',
        ];

        for (let i = 0; i < COUNT; i++) {
            particles.push({
                x: Math.random() * width,
                y: Math.random() * height,
                vx: (Math.random() - 0.5) * 0.3,
                vy: (Math.random() - 0.5) * 0.3,
                r: Math.random() * 1.8 + 0.5,
                color: COLORS[Math.floor(Math.random() * COLORS.length)],
                alpha: Math.random() * 0.5 + 0.2,
            });
        }

        const draw = () => {
            ctx.clearRect(0, 0, width, height);

            // Connections
            for (let i = 0; i < particles.length; i++) {
                for (let j = i + 1; j < particles.length; j++) {
                    const dx = particles[i].x - particles[j].x;
                    const dy = particles[i].y - particles[j].y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist < 130) {
                        const op = (1 - dist / 130) * 0.18;
                        ctx.strokeStyle = `rgba(0, 240, 255, ${op})`;
                        ctx.lineWidth = 0.6;
                        ctx.beginPath();
                        ctx.moveTo(particles[i].x, particles[i].y);
                        ctx.lineTo(particles[j].x, particles[j].y);
                        ctx.stroke();
                    }
                }
            }

            // Particles
            particles.forEach(p => {
                p.x += p.vx;
                p.y += p.vy;
                if (p.x < 0 || p.x > width) p.vx *= -1;
                if (p.y < 0 || p.y > height) p.vy *= -1;

                ctx.beginPath();
                ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
                ctx.fillStyle = p.color + p.alpha + ')';
                ctx.fill();

                ctx.beginPath();
                ctx.arc(p.x, p.y, p.r * 3, 0, Math.PI * 2);
                ctx.fillStyle = p.color + (p.alpha * 0.15) + ')';
                ctx.fill();
            });

            requestAnimationFrame(draw);
        };
        draw();
    }

    // ---- Console signature ----
    console.log(
        '%c⚡ AutomizeLabs %c — automação · IA · integração',
        'color:#00ff88;font-weight:700;font-size:14px;text-shadow:0 0 8px #00ff88;',
        'color:#00f0ff;font-size:12px;'
    );
})();
