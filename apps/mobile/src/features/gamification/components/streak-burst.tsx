/**
 * Brief lime particle burst behind the streak capsule for milestones.
 * Reduce-motion aware and never blocks touches.
 * See docs/06-gamification.md#celebrations.
 */

import { palette } from '@loop/shared';
import { Canvas, Circle, Group } from '@shopify/react-native-skia';
import React, { useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
}

export function StreakBurst({
  active,
  density = 16,
  onComplete,
}: {
  active: boolean;
  density?: number;
  onComplete?: () => void;
}) {
  const reducedMotion = useReducedMotion();
  const progress = useSharedValue(0);

  const particles = useMemo(() => {
    const list: Particle[] = [];
    const count = density;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * 2 * Math.PI + (Math.random() * 0.4 - 0.2);
      const speed = 40 + Math.random() * 40;
      list.push({
        x: 0,
        y: 0,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: 2 + Math.random() * 2,
      });
    }
    return list;
  }, [density]);

  useEffect(() => {
    if (active) {
      if (reducedMotion) {
        onComplete?.();
        return;
      }
      progress.value = 0;
      progress.value = withTiming(1, { duration: 800 }, (finished) => {
        if (finished && onComplete) {
          // Finished
        }
      });
    }
  }, [active, onComplete, progress, reducedMotion]);

  if (!active || reducedMotion) return null;

  return (
    <View style={styles.container} pointerEvents="none">
      <Canvas style={styles.canvas}>
        <Group>
          {particles.map((p, idx) => (
            <ParticleDot key={idx} particle={p} progress={progress} />
          ))}
        </Group>
      </Canvas>
    </View>
  );
}

function ParticleDot({
  particle,
  progress,
}: {
  particle: Particle;
  progress: { value: number };
}) {
  const cx = useDerivedValue(() => 60 + particle.vx * progress.value);
  const cy = useDerivedValue(() => 30 + particle.vy * progress.value);
  const opacity = useDerivedValue(() => 1 - progress.value);
  const r = useDerivedValue(() => particle.radius * (1 - progress.value * 0.5));

  return <Circle cx={cx} cy={cy} r={r} color={palette.lime} opacity={opacity} />;
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    width: 120,
    height: 60,
    left: -20,
    top: -10,
    zIndex: -1,
  },
  canvas: {
    width: 120,
    height: 60,
  },
});
