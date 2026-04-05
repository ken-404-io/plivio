import { useEffect, useRef } from 'react';

/**
 * Attaches an IntersectionObserver to a container element.
 * Any child with the class `reveal` gets the class `reveal--visible`
 * added once it scrolls into view — triggering CSS entrance animations.
 *
 * Usage:
 *   const sectionRef = useScrollReveal();
 *   <section ref={sectionRef}>
 *     <div className="reveal">...</div>
 *   </section>
 */
export function useScrollReveal<T extends HTMLElement = HTMLDivElement>(
  threshold = 0.12,
) {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const targets = el.querySelectorAll<HTMLElement>('.reveal');
    if (targets.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('reveal--visible');
            observer.unobserve(entry.target); // animate once
          }
        });
      },
      { threshold },
    );

    targets.forEach((t) => observer.observe(t));

    return () => observer.disconnect();
  }, [threshold]);

  return ref;
}
