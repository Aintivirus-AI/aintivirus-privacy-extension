import React, { useEffect, useRef } from 'react';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  alpha: number;
  targetAlpha: number;
  pulse: number;
  pulseSpeed: number;
}

const PARTICLE_COUNT = 60;
const CONNECTION_DISTANCE = 80;
const MOUSE_RADIUS = 100;

const COLORS = [
  'rgba(91, 95, 199, 1)',    // Primary accent
  'rgba(129, 140, 248, 1)',  // Lighter indigo
  'rgba(167, 139, 250, 1)',  // Purple tint
  'rgba(99, 102, 241, 1)',   // Indigo
  'rgba(139, 92, 246, 1)',   // Violet
  'rgba(79, 70, 229, 1)',    // Deep indigo
];

const LockedParticles: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();
  const particlesRef = useRef<Particle[]>([]);
  const mouseRef = useRef({ x: -1000, y: -1000 });
  const dimensionsRef = useRef({ width: 0, height: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resizeCanvas = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      
      const rect = parent.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      
      ctx.scale(dpr, dpr);
      
      dimensionsRef.current = { width: rect.width, height: rect.height };
    };

    const createParticle = (x?: number, y?: number): Particle => {
      const { width, height } = dimensionsRef.current;
      return {
        x: x ?? Math.random() * width,
        y: y ?? Math.random() * height,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        radius: Math.random() * 2.5 + 1,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        alpha: Math.random() * 0.5 + 0.2,
        targetAlpha: Math.random() * 0.5 + 0.3,
        pulse: Math.random() * Math.PI * 2,
        pulseSpeed: Math.random() * 0.02 + 0.01,
      };
    };

    const initParticles = () => {
      particlesRef.current = [];
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        particlesRef.current.push(createParticle());
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    };

    const handleMouseLeave = () => {
      mouseRef.current = { x: -1000, y: -1000 };
    };

    const drawParticle = (p: Particle) => {
      // Pulsing effect
      p.pulse += p.pulseSpeed;
      const pulseFactor = Math.sin(p.pulse) * 0.3 + 0.7;
      const currentAlpha = p.alpha * pulseFactor;

      // Glow effect
      const gradient = ctx.createRadialGradient(
        p.x, p.y, 0,
        p.x, p.y, p.radius * 3
      );
      const baseColor = p.color.replace(/[\d.]+\)$/, `${currentAlpha * 0.3})`);
      const coreColor = p.color.replace(/[\d.]+\)$/, `${currentAlpha})`);
      
      gradient.addColorStop(0, coreColor);
      gradient.addColorStop(0.4, baseColor);
      gradient.addColorStop(1, 'transparent');

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius * 3, 0, Math.PI * 2);
      ctx.fillStyle = gradient;
      ctx.fill();

      // Core
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fillStyle = coreColor;
      ctx.fill();
    };

    const drawConnections = () => {
      const particles = particlesRef.current;
      
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const distance = Math.sqrt(dx * dx + dy * dy);

          if (distance < CONNECTION_DISTANCE) {
            const alpha = (1 - distance / CONNECTION_DISTANCE) * 0.15;
            
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `rgba(91, 95, 199, ${alpha})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }
    };

    const updateParticle = (p: Particle) => {
      const { width, height } = dimensionsRef.current;
      const mouse = mouseRef.current;

      // Mouse interaction - particles gently move away
      const dx = p.x - mouse.x;
      const dy = p.y - mouse.y;
      const distToMouse = Math.sqrt(dx * dx + dy * dy);

      if (distToMouse < MOUSE_RADIUS && distToMouse > 0) {
        const force = (MOUSE_RADIUS - distToMouse) / MOUSE_RADIUS;
        const angle = Math.atan2(dy, dx);
        p.vx += Math.cos(angle) * force * 0.2;
        p.vy += Math.sin(angle) * force * 0.2;
      }

      // Apply velocity with damping
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.99;
      p.vy *= 0.99;

      // Boundary wrapping with smooth transition
      const margin = 20;
      if (p.x < -margin) p.x = width + margin;
      if (p.x > width + margin) p.x = -margin;
      if (p.y < -margin) p.y = height + margin;
      if (p.y > height + margin) p.y = -margin;

      // Subtle random movement
      p.vx += (Math.random() - 0.5) * 0.02;
      p.vy += (Math.random() - 0.5) * 0.02;

      // Limit velocity
      const maxSpeed = 1;
      const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
      if (speed > maxSpeed) {
        p.vx = (p.vx / speed) * maxSpeed;
        p.vy = (p.vy / speed) * maxSpeed;
      }
    };

    const animate = () => {
      const { width, height } = dimensionsRef.current;
      
      // Clear with slight trail effect
      ctx.fillStyle = 'rgba(18, 18, 26, 0.15)';
      ctx.fillRect(0, 0, width, height);

      // Draw connections first (below particles)
      drawConnections();

      // Update and draw particles
      particlesRef.current.forEach((p) => {
        updateParticle(p);
        drawParticle(p);
      });

      animationRef.current = requestAnimationFrame(animate);
    };

    // Initialize
    resizeCanvas();
    initParticles();
    
    // Clear canvas initially
    const { width, height } = dimensionsRef.current;
    ctx.fillStyle = 'rgba(18, 18, 26, 1)';
    ctx.fillRect(0, 0, width, height);

    // Start animation
    animate();

    // Event listeners
    window.addEventListener('resize', resizeCanvas);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      window.removeEventListener('resize', resizeCanvas);
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="locked-particles-canvas"
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'auto',
        zIndex: 0,
      }}
    />
  );
};

export default LockedParticles;
