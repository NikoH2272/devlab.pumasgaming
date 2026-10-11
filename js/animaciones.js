// ============================================================
// PUMAS DEV LAB · Animaciones de la interfaz
// ------------------------------------------------------------
// · Los números de los indicadores (KPI) cuentan hasta su valor.
// · Las secciones largas del informe aparecen al hacer scroll.
// No cambia datos ni lógica; si el sistema pide reducir el
// movimiento, no hace nada.
// ============================================================

(function () {
    const reducir = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducir) return;

    // ---------- Contador de KPI ----------
    // Solo anima textos que son un número limpio (ej. "42", "3.5", "67%")
    const NUMERO = /^(\d+(?:[.,]\d+)?)(%?)$/;

    function contar(el) {
        if (el.dataset.contado) return;
        const m = NUMERO.exec(el.textContent.trim());
        if (!m) return;
        el.dataset.contado = '1';
        const final = parseFloat(m[1].replace(',', '.'));
        const decimales = (m[1].split(/[.,]/)[1] || '').length;
        const sufijo = m[2];
        if (!final) return;
        const inicio = performance.now(), dur = 900;
        const paso = ahora => {
            const t = Math.min(1, (ahora - inicio) / dur);
            const e = 1 - Math.pow(1 - t, 3);
            el.textContent = (final * e).toFixed(decimales) + sufijo;
            if (t < 1) requestAnimationFrame(paso);
            else el.textContent = m[1] + sufijo;
        };
        requestAnimationFrame(paso);
    }

    // ---------- Aparición al hacer scroll ----------
    const observador = 'IntersectionObserver' in window ? new IntersectionObserver(entradas => {
        entradas.forEach(en => {
            if (!en.isIntersecting) return;
            en.target.classList.add('visible');
            observador.unobserve(en.target);
        });
    }, { rootMargin: '0px 0px -8% 0px' }) : null;

    function preparar(raiz) {
        raiz.querySelectorAll('.kpi-num, .kpi-valor').forEach(contar);
        if (!observador) return;
        raiz.querySelectorAll('.inf-seccion, .pagina-informe .grafica').forEach(el => {
            if (el.classList.contains('revelar')) return;
            el.classList.add('revelar');
            observador.observe(el);
        });
    }

    // Lo que pintan las vistas llega por innerHTML: se observa el contenido nuevo
    new MutationObserver(cambios => {
        cambios.forEach(c => c.addedNodes.forEach(n => { if (n.nodeType === 1) preparar(n.parentElement || n); }));
    }).observe(document.body, { childList: true, subtree: true });

    // Antes de imprimir, todo visible
    window.addEventListener('beforeprint', () => document.querySelectorAll('.revelar').forEach(el => el.classList.add('visible')));
})();
