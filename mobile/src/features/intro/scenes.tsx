import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, Path, Pattern, Rect } from 'react-native-svg';

import { LOGO_BOTTOM, LOGO_TOP, LOGO_VIEWBOX } from '../../components/BrandMark';
import { Icon } from '../../components/icons';
import { Text } from '../../components/Text';
import { Avatar, DisplayName } from '../../components/ui';
import { Anim, ease, Loop } from './anim';

// The intro's scenes. Each one animates itself in from the moment it mounts
// (IntroScreen mounts one at a time), and says as little as it can: an eyebrow,
// one short line, and the thing itself moving. Colours are fixed rather than
// themed - like the splash, this is the brand speaking.

export const C = {
  ink: '#191713',
  blue: '#1f7a99',
  blueLight: '#2a86a8',
  deep: '#12506a',
  soft: '#e3f0f5',
  muted: '#5c5952',
  faint: '#8a867e',
  line: '#e9e8e4',
  surface: '#f6f5f3',
  white: '#ffffff',
};

/** The XOXD mark: XO in `top`, XD in `bottom`. */
export function Mark({ size, top, bottom }: { size: number; top: string; bottom: string }) {
  return (
    <Svg width={size} height={size * (1525 / 1503)} viewBox={LOGO_VIEWBOX}>
      <Path d={LOGO_TOP} fill={top} fillRule="evenodd" />
      <Path d={LOGO_BOTTOM} fill={bottom} fillRule="evenodd" />
    </Svg>
  );
}

/** A fine dot grid that drifts, behind every scene. */
export function DotGrid({ dark }: { dark?: boolean }) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Loop repeat linear duration={5000} to={{ translateX: -18, translateY: -18 }} style={{ position: 'absolute', left: 0, top: 0, right: -18, bottom: -18 }}>
        <Svg width="100%" height="100%">
          <Defs>
            <Pattern id="dots" width={18} height={18} patternUnits="userSpaceOnUse">
              <Circle cx={9} cy={9} r={1.15} fill={dark ? '#2e2b27' : '#e2e0db'} />
            </Pattern>
          </Defs>
          <Rect width="100%" height="100%" fill="url(#dots)" />
        </Svg>
      </Loop>
    </View>
  );
}

/** A headline whose words slide up into place one after another. */
function Headline({ text, delay = 120, size = 30, colors = [] }: { text: string; delay?: number; size?: number; colors?: (string | undefined)[] }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
      {text.split(' ').map((word, i) => (
        <View key={i} style={{ overflow: 'hidden', marginRight: size * 0.3 }}>
          <Anim from={{ translateY: size * 1.4 }} delay={delay + i * 70} duration={700}>
            <Text style={{ fontSize: size, lineHeight: size * 1.15, fontWeight: '800', letterSpacing: -size * 0.035, color: colors[i] || C.ink }}>{word}</Text>
          </Anim>
        </View>
      ))}
    </View>
  );
}

/** The top of a light scene: a numbered eyebrow with a line drawing out, and the headline. */
function SceneTitle({ eyebrow, title, num }: { eyebrow: string; title: string; num: string }) {
  return (
    <View style={{ gap: 10 }}>
      <Anim from={{ opacity: 0, translateX: 60 }} delay={80} duration={1000} style={{ position: 'absolute', right: -40, top: -36 }} pointerEvents="none">
        <Text style={{ fontSize: 170, lineHeight: 180, fontWeight: '800', letterSpacing: -12, color: '#f1f0ed' }}>{num}</Text>
      </Anim>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Anim from={{ opacity: 0, translateY: 10 }} delay={80}>
          <Text style={{ fontSize: 11, fontWeight: '800', letterSpacing: 1.6, color: C.blue }}>{eyebrow}</Text>
        </Anim>
        <Anim from={{ scaleX: 0 }} delay={140} duration={600} style={{ flex: 1, height: 1.5, backgroundColor: C.blue, transformOrigin: 'left' }} />
      </View>
      <Headline text={title} />
    </View>
  );
}

// -------------------------------------------------------------- 1. tiles

export function TilesScene() {
  const tiles = Array.from({ length: 49 }, (_, i) => {
    const row = Math.floor(i / 7);
    const col = i % 7;
    const pick = (i * 13) % 7;
    const blue = pick === 0 || pick === 3;
    return {
      color: blue ? C.blueLight : pick === 5 ? '#3d3a35' : C.white,
      glow: blue,
      popIn: 150 + (((i * 37) % 49) / 49) * 850,
      fold: 1450 + (6 - (Math.abs(row - 3) + Math.abs(col - 3))) * 50,
    };
  });
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 56 }}>
      <View style={{ width: 274, height: 274 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {tiles.map((t, i) => (
            <Anim
              key={i}
              from={{ scale: 0 }}
              delay={t.popIn}
              duration={420}
              easing={ease.back}
              to={{ scale: 0, rotate: 45, opacity: 0 }}
              thenDelay={t.fold}
              thenDuration={380}
              style={{
                width: 34,
                height: 34,
                borderRadius: 9,
                backgroundColor: t.color,
                shadowColor: C.blueLight,
                shadowOpacity: t.glow ? 0.7 : 0,
                shadowRadius: 10,
                shadowOffset: { width: 0, height: 0 },
              }}
            />
          ))}
        </View>
        <Anim from={{ scale: 0.3, opacity: 0 }} delay={1750} duration={650} easing={ease.back} style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
          <Mark size={156} top={C.white} bottom={C.blueLight} />
        </Anim>
      </View>
      <Anim from={{ opacity: 0, translateY: 14 }} delay={2300} duration={800}>
        <Text style={{ fontSize: 13, fontWeight: '800', letterSpacing: 3, color: C.white }}>WELCOME TO XOXD</Text>
      </Anim>
    </View>
  );
}

// -------------------------------------------------------------- 2. demos

function Chip({ label, light }: { label: string; light?: boolean }) {
  return (
    <View style={{ alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: light ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.14)' }}>
      <Text style={{ fontSize: 10, fontWeight: '800', letterSpacing: 1, color: C.white }}>{label}</Text>
    </View>
  );
}

const card = { position: 'absolute' as const, left: 0, right: 0, top: 0, bottom: 0, borderRadius: 28, overflow: 'hidden' as const, padding: 22, justifyContent: 'flex-end' as const };

export function DemosScene() {
  const bars = Array.from({ length: 14 }, (_, i) => ({ h: 40 + ((i * 37) % 60), d: ((i * 13) % 10) * 40, dur: 350 + ((i * 7) % 5) * 100 }));
  return (
    <View style={{ flex: 1 }}>
      <SceneTitle num="01" eyebrow="DEMOS" title="Swipe. Try. Repeat." />
      <View style={{ flex: 1, marginTop: 28, marginBottom: 12, marginHorizontal: 6 }}>
        {/* The one that stays: an app, with "Try it" pulsing. */}
        <Anim from={{ translateY: 620, rotate: 10 }} delay={150} duration={700} style={[card, { backgroundColor: C.ink }]}>
          <View style={{ position: 'absolute', left: 22, right: 22, top: 26, gap: 10 }}>
            {[C.blue, '#8a867e', '#8a867e'].map((dot, i) => (
              <View key={i} style={{ height: 44, borderRadius: 12, backgroundColor: '#2c2a26', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: 10 }}>
                <View style={{ width: 18, height: 18, borderRadius: 6, backgroundColor: dot }} />
                <View style={{ width: [130, 110, 80][i], height: 8, borderRadius: 4, backgroundColor: '#46433d' }} />
                {i === 0 ? (
                  <View style={{ marginLeft: 'auto', width: 40, height: 22, borderRadius: 999, backgroundColor: '#3d3a35' }}>
                    <Loop to={{ translateX: 18 }} duration={700} style={{ position: 'absolute', left: 3, top: 3, width: 16, height: 16, borderRadius: 8, backgroundColor: C.white }} />
                  </View>
                ) : null}
              </View>
            ))}
          </View>
          <Chip label="APP" />
          <View style={{ marginTop: 14, alignSelf: 'flex-start' }}>
            <Loop repeat to={{ scale: 1.9, opacity: 0 }} duration={1200} delay={1600} style={[StyleSheet.absoluteFill, { borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.5)' }]} />
            <View style={{ paddingHorizontal: 18, paddingVertical: 11, borderRadius: 999, backgroundColor: C.white }}>
              <Text style={{ fontSize: 13, fontWeight: '800', color: C.ink }}>Try it</Text>
            </View>
          </View>
        </Anim>
        {/* A game, swiped away second. */}
        <Anim from={{ translateY: 620, rotate: 10 }} delay={250} duration={700} to={{ translateY: -900, rotate: -8 }} thenDelay={1600} thenDuration={550} style={[card, { backgroundColor: C.deep }]}>
          {Array.from({ length: 10 }, (_, i) => (
            <View key={`h${i}`} style={{ position: 'absolute', left: 0, right: 0, top: i * 22, height: 1, backgroundColor: 'rgba(255,255,255,0.07)' }} />
          ))}
          {Array.from({ length: 16 }, (_, i) => (
            <View key={`v${i}`} style={{ position: 'absolute', top: 0, height: 220, left: i * 22, width: 1, backgroundColor: 'rgba(255,255,255,0.07)' }} />
          ))}
          <View style={{ position: 'absolute', left: 24, right: 24, top: 176, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.25)' }} />
          <Loop to={{ translateX: 170, translateY: -70 }} duration={900} style={{ position: 'absolute', left: 40, top: 150, width: 22, height: 22, borderRadius: 6, backgroundColor: C.white }} />
          <Chip label="GAME" />
        </Anim>
        {/* Music, swiped away first. */}
        <Anim from={{ translateY: 620, rotate: 10 }} delay={350} duration={700} to={{ translateY: -900, rotate: -8 }} thenDelay={1050} thenDuration={550} style={[card, { backgroundColor: C.blue }]}>
          <View style={{ position: 'absolute', left: 26, right: 26, top: 40, height: 150, flexDirection: 'row', alignItems: 'flex-end', gap: 7 }}>
            {bars.map((b, i) => (
              <Loop key={i} to={{ scaleY: 0.25 }} duration={b.dur} delay={b.d} style={{ flex: 1, height: `${b.h}%`, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.92)', transformOrigin: 'bottom' }} />
            ))}
          </View>
          <Chip label="MUSIC" light />
        </Anim>
        {/* The finger doing the swiping. */}
        {[850, 1400].map((d) => (
          <Anim
            key={d}
            from={{ opacity: 0, translateY: 50 }}
            delay={d}
            duration={160}
            to={{ opacity: 0, translateY: -190 }}
            thenDelay={d + 160}
            thenDuration={420}
            style={{ position: 'absolute', alignSelf: 'center', bottom: 80, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.95)', borderWidth: 6, borderColor: 'rgba(255,255,255,0.4)' }}
          />
        ))}
      </View>
    </View>
  );
}

// -------------------------------------------------------------- 3. news

export function NewsScene() {
  const rows = [
    { title: 'BioWare closed', fresh: true },
    { title: 'GTA 6 trailer', fresh: true },
    { title: 'Cyberpunk movie', fresh: false },
  ];
  return (
    <View style={{ flex: 1 }}>
      <SceneTitle num="02" eyebrow="NEWS" title="All the news, one place." />
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <View style={{ transform: [{ rotate: '-1.2deg' }] }}>
        <Anim from={{ opacity: 0, translateY: 40, rotate: -4 }} delay={80} duration={900}>
          <View style={{ backgroundColor: '#fbfaf8', borderRadius: 8, padding: 20, gap: 12, shadowColor: C.ink, shadowOpacity: 0.18, shadowRadius: 24, shadowOffset: { width: 0, height: 18 }, elevation: 8 }}>
            <Anim from={{ scaleX: 0 }} delay={350} duration={550} style={{ height: 6, backgroundColor: C.ink, transformOrigin: 'left' }} />
            <Anim from={{ opacity: 0, translateY: -10 }} delay={480} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Icon name="globe" size={26} color={C.ink} strokeWidth={2.4} />
                <Text style={{ fontSize: 30, fontWeight: '800', letterSpacing: -1, color: C.ink }}>News</Text>
              </View>
              <Anim from={{ scale: 0.3, opacity: 0 }} delay={1500} easing={ease.back} duration={450} style={{ paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, backgroundColor: C.blue }}>
                <Text style={{ fontSize: 10, fontWeight: '800', letterSpacing: 0.6, color: C.white }}>2 NEW</Text>
              </Anim>
            </Anim>
            <Anim from={{ scaleX: 0 }} delay={620} duration={500} style={{ height: 1.5, backgroundColor: C.ink, transformOrigin: 'left' }} />
            {rows.map((r, i) => (
              <Anim key={r.title} from={{ opacity: 0, translateY: -12 }} delay={800 + i * 180} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#e3e1dc' }}>
                <View style={{ flex: 1 }}>
                  {i === 0 ? (
                    <Anim from={{ scaleX: 0 }} delay={1650} duration={550} style={{ position: 'absolute', left: -4, top: 2, bottom: 0, width: 150, borderRadius: 4, backgroundColor: C.soft, transformOrigin: 'left' }} />
                  ) : null}
                  <Text style={{ fontSize: 16, fontWeight: '800', color: r.fresh ? C.ink : C.faint }}>{r.title}</Text>
                </View>
                <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: r.fresh ? C.blue : '#ecebe8' }}>
                  <Text style={{ fontSize: 9, fontWeight: '800', letterSpacing: 0.6, color: r.fresh ? C.white : C.muted }}>{r.fresh ? 'NEW' : 'READ'}</Text>
                </View>
              </Anim>
            ))}
            <Anim from={{ opacity: 0, translateY: -10 }} delay={1900} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 11, borderRadius: 12, backgroundColor: C.ink }}>
              <Icon name="demos" size={18} color={C.white} strokeWidth={2.4} />
              <Text style={{ flex: 1, fontSize: 12, fontWeight: '700', color: C.white }}>New on XOXD</Text>
              <Text style={{ fontSize: 12, color: '#b9b5ad' }}>3 demos</Text>
            </Anim>
          </View>
        </Anim>
        </View>
      </View>
    </View>
  );
}

// -------------------------------------------------------------- 4. ranks

function XpRoll() {
  // 40 -> 65 -> 95 -> 110: each number rolls up and out as the next gain lands.
  const steps = [40, 65, 95, 110];
  const at = (i: number) => 600 + (i - 1) * 400;
  return (
    <View style={{ width: 72, height: 20, overflow: 'hidden' }}>
      {steps.map((xp, i) => (
        <Anim
          key={xp}
          from={i === 0 ? {} : { translateY: 20, opacity: 0 }}
          delay={i === 0 ? 0 : at(i)}
          duration={i === 0 ? 1 : 200}
          to={i === steps.length - 1 ? undefined : { translateY: -20, opacity: 0 }}
          thenDelay={at(i + 1)}
          thenDuration={200}
          style={{ position: 'absolute', right: 0, top: 0 }}
        >
          <Text style={{ fontSize: 14, lineHeight: 20, fontWeight: '800', color: C.deep }}>{xp} XP</Text>
        </Anim>
      ))}
    </View>
  );
}

export function RanksScene() {
  const others = [
    { name: '@maker', xp: '180 XP', initial: 'M', move: 0 },
    { name: '@pixelpusher', xp: '96 XP', initial: 'P', move: 62 },
    { name: '@synthkid', xp: '72 XP', initial: 'S', move: 62 },
  ];
  return (
    <View style={{ flex: 1 }}>
      <SceneTitle num="03" eyebrow="RANKS" title="Everything counts." />
      <View style={{ flex: 1, justifyContent: 'center', gap: 22 }}>
        <Anim from={{ opacity: 0, translateY: 20 }} delay={100} style={{ height: 248, borderRadius: 24, backgroundColor: C.white, borderWidth: 1.5, borderColor: C.line, overflow: 'hidden' }}>
          {others.map((r, i) => (
            <Anim key={r.name} to={r.move ? { translateY: r.move } : undefined} thenDelay={1550} thenDuration={900} style={[styles.row, { top: i * 62, borderTopWidth: i ? 1 : 0 }]}>
              <View style={[styles.face, { backgroundColor: i ? C.faint : C.muted }]}>
                <Text style={styles.initial}>{r.initial}</Text>
              </View>
              <Text style={{ flex: 1, fontSize: 14, fontWeight: '800', color: C.ink }}>{r.name}</Text>
              <Text style={{ fontSize: 14, fontWeight: '700', color: C.muted }}>{r.xp}</Text>
            </Anim>
          ))}
          <Anim to={{ translateY: -124 }} thenDelay={1550} thenDuration={900} style={[styles.row, { top: 186, borderTopWidth: 1, backgroundColor: '#f2f8fa', zIndex: 2 }]}>
            <View style={[styles.face, { backgroundColor: C.blue }]}>
              <Text style={styles.initial}>Y</Text>
            </View>
            <Text style={{ flex: 1, fontSize: 14, fontWeight: '800', color: C.deep }}>you</Text>
            <XpRoll />
          </Anim>
        </Anim>
        <View style={{ height: 44, alignItems: 'center' }}>
          {['+25 XP', '+30 XP', '+15 XP'].map((g, i) => (
            <Anim
              key={g}
              from={{ opacity: 0, translateY: 8 }}
              delay={450 + i * 400}
              duration={220}
              to={{ opacity: 0, translateY: -40 }}
              thenDelay={450 + i * 400 + 220}
              thenDuration={650}
              style={{ position: 'absolute', top: 0, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: C.soft }}
            >
              <Text style={{ fontSize: 12, fontWeight: '800', color: C.deep }}>{g}</Text>
            </Anim>
          ))}
          {Array.from({ length: 10 }, (_, k) => (
            <View key={k} style={{ position: 'absolute', top: 18, width: 7, height: 7, transform: [{ rotate: `${k * 36}deg` }] }}>
              <Anim from={{ opacity: 0 }} delay={2300} duration={1} to={{ translateY: -46, opacity: 0, scale: 0.3 }} thenDelay={2301} thenDuration={800} style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: k % 2 ? C.ink : C.blue }} />
            </View>
          ))}
          <Anim from={{ scale: 0.3, opacity: 0 }} delay={2300} duration={500} easing={ease.back} style={{ position: 'absolute', top: 2, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999, backgroundColor: C.ink }}>
            <Text style={{ fontSize: 15, fontWeight: '800', color: C.white }}>LV 1</Text>
          </Anim>
        </View>
      </View>
    </View>
  );
}

// -------------------------------------------------------------- 5. you

export function YouScene() {
  const chips = [
    { text: 'BORDER', angle: -90, bg: C.ink, fg: C.white },
    { text: 'NAME', angle: 30, bg: C.soft, fg: C.deep },
    { text: '+25 XP', angle: 150, bg: C.white, fg: C.ink },
  ];
  const R = 128;
  return (
    <View style={{ flex: 1 }}>
      <SceneTitle num="04" eyebrow="YOU" title="Make it yours." />
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: 2 * R + 40, height: 2 * R + 40, alignItems: 'center', justifyContent: 'center' }}>
          <Anim from={{ opacity: 0, scale: 0.8 }} delay={300} duration={800} style={{ position: 'absolute', width: 2 * R, height: 2 * R, borderRadius: R, borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#d6d4cf' }} />
          <Loop repeat linear duration={9000} to={{ rotate: 360 }} style={{ position: 'absolute', width: 2 * R, height: 2 * R }}>
            {chips.map((c, i) => {
              const rad = (c.angle * Math.PI) / 180;
              return (
                <View key={c.text} style={{ position: 'absolute', left: R + R * Math.cos(rad) - 60, top: R + R * Math.sin(rad) - 20, width: 120, height: 40, alignItems: 'center', justifyContent: 'center' }}>
                  <Loop repeat linear duration={9000} to={{ rotate: -360 }}>
                    <Anim from={{ scale: 0.3, opacity: 0 }} delay={1150 + i * 200} duration={450} easing={ease.back} style={{ paddingHorizontal: 11, paddingVertical: 7, borderRadius: 999, backgroundColor: c.bg, borderWidth: 1.5, borderColor: C.line }}>
                      <Text style={{ fontSize: 10, fontWeight: '800', letterSpacing: 1, color: c.fg }}>{c.text}</Text>
                    </Anim>
                  </Loop>
                </View>
              );
            })}
          </Loop>
          <Anim from={{ scale: 0.4, opacity: 0, rotate: -40 }} delay={100} duration={900} easing={ease.back}>
            <Avatar name="Y" size={120} ring="border-gold" />
          </Anim>
          <Anim from={{ opacity: 0, translateY: 14 }} delay={1000} duration={700} style={{ position: 'absolute', bottom: -44, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <DisplayName name="you" effect="name-gradient" style={{ fontSize: 34 }} />
            <View style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: C.ink }}>
              <Text style={{ fontSize: 12, fontWeight: '800', color: C.white }}>LV 1</Text>
            </View>
          </Anim>
        </View>
      </View>
    </View>
  );
}

// -------------------------------------------------------------- 6. welcome

export function WelcomeScene() {
  return (
    <View style={{ gap: 22 }}>
      <Anim from={{ opacity: 0, translateY: 16 }} delay={100}>
        <Mark size={64} top={C.white} bottom={C.blueLight} />
      </Anim>
      <Headline text="Demos, news, ranks and you." size={38} delay={250} colors={[C.white, C.white, C.white, C.white, C.blueLight]} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { position: 'absolute', left: 0, right: 0, height: 62, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, borderTopColor: '#efeeec', backgroundColor: C.white },
  face: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  initial: { fontSize: 13, fontWeight: '800', color: C.white },
});
