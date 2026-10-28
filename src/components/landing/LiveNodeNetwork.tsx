"use client";

import { useEffect, useRef, useState } from "react";

interface LiveNodeNetworkProps {
  className?: string;
}

interface NetworkNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  glowColor: string;
  isMint: boolean;
  phase: number;
  pulseSpeed: number;
}

interface DataPacket {
  fromIndex: number;
  toIndex: number;
  progress: number;
  speed: number;
  color: string;
}

/**
 * Componente LiveNodeNetwork
 * 
 * Animação de fundo sutil baseada em Canvas 2D:
 * - Rede de pontos vivos e discretos com distribuição orgânica e movimento contínuo e lento.
 * - Conexões translúcidas efêmeras em tons de roxo do Linkzivo (#8B5CF6) com toques em verde-menta (#10B981).
 * - Pequenos pacotes translúcidos de dados trafegando pelas conexões.
 * - Desempenho otimizado: devicePixelRatio limitado a 2, suspensão automática quando a aba está oculta,
 *   densidade reduzida em telas móveis e suporte completo a prefers-reduced-motion.
 * - Camada puramente de fundo com pointer-events: none para jamais interferir em cliques, seleção ou scroll.
 */
export function LiveNodeNetwork({ className = "" }: LiveNodeNetworkProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    let animationFrameId: number | null = null;
    let isTabVisible = !document.hidden;
    let isDestroyed = false;

    // Detecção de preferência de movimento reduzido
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let prefersReducedMotion = motionQuery.matches;

    // Configurações de nós e conexões
    let nodes: NetworkNode[] = [];
    let packets: DataPacket[] = [];
    let width = 0;
    let height = 0;
    let dpr = 1;
    let maxDistance = 130;

    /**
     * Define o número de nós com base na largura da viewport
     */
    function getNodeCount(w: number): number {
      if (w < 640) return 18; // Mobile
      if (w < 1024) return 28; // Tablet
      return 42; // Desktop
    }

    function createSingleNode(index: number): NetworkNode {
      const isMint = index % 4 === 0; // ~25% verde menta, ~75% roxo Linkzivo
      const speedMultiplier = 0.22;
      return {
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * speedMultiplier,
        vy: (Math.random() - 0.5) * speedMultiplier,
        radius: isMint ? 1.4 + Math.random() * 0.6 : 1.2 + Math.random() * 0.8,
        color: isMint ? "rgba(16, 185, 129, 0.75)" : "rgba(139, 92, 246, 0.70)",
        glowColor: isMint ? "rgba(16, 185, 129, 0.35)" : "rgba(139, 92, 246, 0.30)",
        isMint,
        phase: Math.random() * Math.PI * 2,
        pulseSpeed: 0.015 + Math.random() * 0.015,
      };
    }

    /**
     * Inicializa ou adapta a rede de nós de forma estável, sem saltos ao redimensionar
     */
    function adaptNodes() {
      const targetCount = getNodeCount(width);
      maxDistance = width < 640 ? 95 : 130;

      if (nodes.length === 0) {
        // Inicialização primária
        packets = [];
        for (let i = 0; i < targetCount; i++) {
          nodes.push(createSingleNode(i));
        }
      } else if (nodes.length < targetCount) {
        // Incrementa nós adicionais se a tela expandiu
        const diff = targetCount - nodes.length;
        for (let i = 0; i < diff; i++) {
          nodes.push(createSingleNode(nodes.length + i));
        }
      } else if (nodes.length > targetCount) {
        // Reduz gradualmente nós excedentes se a tela encolheu
        nodes.splice(targetCount);
        packets = packets.filter((p) => p.fromIndex < targetCount && p.toIndex < targetCount);
      }

      // Garante que posições dos nós existentes respeitem o novo limite de viewport
      for (const node of nodes) {
        if (node.x > width) node.x = width * Math.random();
        if (node.y > height) node.y = height * Math.random();
      }
    }

    /**
     * Ajusta o tamanho do canvas respeitando a densidade de pixels (limitado a 2x)
     */
    function resizeCanvas() {
      if (!canvas || isDestroyed) return;
      width = window.innerWidth;
      height = window.innerHeight;

      dpr = Math.min(window.devicePixelRatio || 1, 2);

      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      ctx?.scale(dpr, dpr);
      adaptNodes();

      if (prefersReducedMotion) {
        drawFrame();
      }
    }

    /**
     * Atualiza as posições e dinâmicas físicas dos nós
     */
    function updatePhysics() {
      for (const node of nodes) {
        node.x += node.vx;
        node.y += node.vy;

        // Rebote suave com margens
        if (node.x < -10) node.x = width + 10;
        else if (node.x > width + 10) node.x = -10;

        if (node.y < -10) node.y = height + 10;
        else if (node.y > height + 10) node.y = -10;

        // Variação suave de pulso
        node.phase += node.pulseSpeed;
      }

      // Atualiza pacotes de dados existentes
      for (let p = packets.length - 1; p >= 0; p--) {
        const packet = packets[p];
        packet.progress += packet.speed;
        if (packet.progress >= 1) {
          packets.splice(p, 1);
        }
      }
    }

    /**
     * Renderiza um quadro no canvas
     */
    function drawFrame() {
      if (!ctx) return;

      // Limpeza do quadro
      ctx.clearRect(0, 0, width, height);

      const activeConnections: Array<{ i: number; j: number; dist: number }> = [];

      // 1. Desenha conexões entre nós próximos
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[j].x - nodes[i].x;
          const dy = nodes[j].y - nodes[i].y;
          const distSq = dx * dx + dy * dy;

          if (distSq < maxDistance * maxDistance) {
            const dist = Math.sqrt(distSq);
            activeConnections.push({ i, j, dist });

            // Opacidade proporcional à proximidade (máximo de 0.22 para preservar discrição)
            const alpha = (1 - dist / maxDistance) * 0.22;

            ctx.beginPath();
            ctx.moveTo(nodes[i].x, nodes[i].y);
            ctx.lineTo(nodes[j].x, nodes[j].y);

            if (nodes[i].isMint && nodes[j].isMint) {
              ctx.strokeStyle = `rgba(16, 185, 129, ${alpha})`;
            } else if (nodes[i].isMint || nodes[j].isMint) {
              // Conexão híbrida com tom índigo/violeta translúcido estável sem alocação de gradientes no heap
              ctx.strokeStyle = `rgba(99, 102, 241, ${alpha})`;
            } else {
              ctx.strokeStyle = `rgba(139, 92, 246, ${alpha})`;
            }

            ctx.lineWidth = 0.8;
            ctx.stroke();
          }
        }
      }

      // 2. Dispara novos pacotes de dados ocasionais pelas conexões ativas
      if (!prefersReducedMotion && packets.length < 5 && activeConnections.length > 0 && Math.random() < 0.03) {
        const randConn = activeConnections[Math.floor(Math.random() * activeConnections.length)];
        const fromNode = nodes[randConn.i];
        const isMint = fromNode.isMint;

        packets.push({
          fromIndex: randConn.i,
          toIndex: randConn.j,
          progress: 0,
          speed: 0.008 + Math.random() * 0.012,
          color: isMint ? "rgba(52, 211, 153, 0.75)" : "rgba(167, 139, 250, 0.75)",
        });
      }

      // 3. Desenha pacotes de dados em trânsito
      for (const packet of packets) {
        const from = nodes[packet.fromIndex];
        const to = nodes[packet.toIndex];
        if (!from || !to) continue;

        const curX = from.x + (to.x - from.x) * packet.progress;
        const curY = from.y + (to.y - from.y) * packet.progress;

        ctx.beginPath();
        ctx.arc(curX, curY, 1.2, 0, Math.PI * 2);
        ctx.fillStyle = packet.color;
        ctx.fill();
      }

      // 4. Desenha os nós vivos
      for (const node of nodes) {
        const pulse = Math.sin(node.phase);
        const currentRadius = node.radius + pulse * 0.3;

        // Halo/glow sutil
        ctx.beginPath();
        ctx.arc(node.x, node.y, currentRadius * 2.2, 0, Math.PI * 2);
        ctx.fillStyle = node.glowColor;
        ctx.fill();

        // Ponto central sólido
        ctx.beginPath();
        ctx.arc(node.x, node.y, Math.max(0.8, currentRadius), 0, Math.PI * 2);
        ctx.fillStyle = node.color;
        ctx.fill();
      }
    }

    /**
     * Loop principal de animação
     */
    function animate() {
      if (isDestroyed) return;
      if (isTabVisible && !prefersReducedMotion) {
        updatePhysics();
        drawFrame();
        animationFrameId = requestAnimationFrame(animate);
      } else {
        animationFrameId = null;
      }
    }

    /**
     * Gerenciador de visibilidade da aba para economia estrita de recursos
     */
    function handleVisibilityChange() {
      if (isDestroyed) return;
      isTabVisible = !document.hidden;
      if (isTabVisible && !prefersReducedMotion) {
        if (!animationFrameId) {
          animationFrameId = requestAnimationFrame(animate);
        }
      } else {
        if (animationFrameId) {
          cancelAnimationFrame(animationFrameId);
          animationFrameId = null;
        }
      }
    }

    /**
     * Gerenciador de preferências de movimento reduzido
     */
    function handleMotionPreferenceChange(e: MediaQueryListEvent) {
      if (isDestroyed) return;
      prefersReducedMotion = e.matches;
      if (prefersReducedMotion) {
        if (animationFrameId) {
          cancelAnimationFrame(animationFrameId);
          animationFrameId = null;
        }
        drawFrame();
      } else if (isTabVisible) {
        if (!animationFrameId) {
          animationFrameId = requestAnimationFrame(animate);
        }
      }
    }

    // Inicialização
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas, { passive: true });
    document.addEventListener("visibilitychange", handleVisibilityChange);

    if (motionQuery.addEventListener) {
      motionQuery.addEventListener("change", handleMotionPreferenceChange);
    } else {
      motionQuery.addListener(handleMotionPreferenceChange);
    }

    if (!prefersReducedMotion) {
      animationFrameId = requestAnimationFrame(animate);
    } else {
      drawFrame();
    }

    // Cleanup completo no unmount
    return () => {
      isDestroyed = true;
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }
      window.removeEventListener("resize", resizeCanvas);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (motionQuery.removeEventListener) {
        motionQuery.removeEventListener("change", handleMotionPreferenceChange);
      } else {
        motionQuery.removeListener(handleMotionPreferenceChange);
      }
    };
  }, [mounted]);

  if (!mounted) {
    return null;
  }

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={`pointer-events-none fixed inset-0 z-0 h-full w-full select-none opacity-60 ${className}`}
      style={{ pointerEvents: "none" }}
    />
  );
}
