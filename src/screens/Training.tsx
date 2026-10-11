import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Btn, Card, Empty, Page, Row, Section, Txt } from '../ui/kit';
import { useTheme } from '../ui/theme';
import { useNav } from '../ui/nav';
import { useApp } from '../state/store';
import { TRAINING_MODULES, learnerKey, nextHintIndex, scenarioAnswerIsCorrect, type TrainingModule } from '../lib/training';

type Stage = 'info' | 'process' | 'guide' | 'check' | 'complete';

function Reveal({ children }: { children: React.ReactNode }) {
  const value = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    value.setValue(0);
    Animated.timing(value, { toValue: 1, duration: 260, useNativeDriver: true }).start();
  }, [value]);
  return <Animated.View style={{ opacity: value, transform: [{ translateY: value.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }}>{children}</Animated.View>;
}

function Celebration({ message }: { message: string }) {
  const { c } = useTheme();
  const scale = useRef(new Animated.Value(0.65)).current;
  const particles = useRef(Array.from({ length: 18 }, () => new Animated.Value(0))).current;
  useEffect(() => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 5 }).start();
    Animated.stagger(22, particles.map(value => Animated.timing(value, { toValue: 1, duration: 650, useNativeDriver: true }))).start();
  }, [particles, scale]);
  const colors = [c.good, c.accent, '#FB873F', '#8B79D9', '#56B4A9', '#F3C969'];
  return (
    <View style={{ alignItems: 'center', padding: 18, gap: 14 }}>
      <View style={{ width: 190, height: 170, alignItems: 'center', justifyContent: 'center' }}>
        {particles.map((v, i) => {
          const angle = (Math.PI * 2 * i) / particles.length;
          const distance = 55 + (i % 3) * 13;
          return <Animated.View key={i} pointerEvents="none" style={{
            position: 'absolute', width: 8, height: 12, borderRadius: 3, backgroundColor: colors[i % colors.length],
            opacity: v.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 1, 0] }),
            transform: [
              { translateX: v.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(angle) * distance] }) },
              { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, Math.sin(angle) * distance] }) },
              { rotate: `${i * 27}deg` },
            ],
          }} />;
        })}
        <Animated.View style={{ width: 92, height: 92, borderRadius: 46, backgroundColor: c.good, alignItems: 'center', justifyContent: 'center', transform: [{ scale }] }}>
          <Ionicons name="checkmark" size={54} color="#FFFFFF" />
        </Animated.View>
      </View>
      <Txt size={26} weight="700" style={{ textAlign: 'center' }}>Module complete</Txt>
      <Txt sub style={{ textAlign: 'center' }}>{message}</Txt>
    </View>
  );
}

export default function Training({ moduleId }: { moduleId?: string }) {
  const { c } = useTheme();
  const nav = useNav();
  const staffId = useApp(s => s.staffId);
  const progress = useApp(s => s.settings.trainingProgress);
  const patchSettings = useApp(s => s.patchSettings);
  const learner = learnerKey(staffId);
  const [stage, setStage] = useState<Stage>('info');
  const [slide, setSlide] = useState(0);
  const [guide, setGuide] = useState(0);
  const [guideDone, setGuideDone] = useState(false);
  const [scenario, setScenario] = useState(0);
  const [choice, setChoice] = useState('');
  const [hint, setHint] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [feedback, setFeedback] = useState('');
  const module = TRAINING_MODULES.find(item => item.id === moduleId);
  const done = progress[learner] ?? [];

  const begin = (item: TrainingModule) => {
    nav.push('training', { moduleId: item.id });
  };
  const submitChoice = (item: TrainingModule) => {
    const current = item.scenarios[scenario];
    if (scenarioAnswerIsCorrect(current, choice)) {
      setFeedback('That’s right.');
      setHint(0);
      setShowAnswer(false);
      if (scenario === item.scenarios.length - 1) setStage('complete');
      else { setScenario(scenario + 1); setChoice(''); }
    } else {
      setFeedback('Not quite. Consider a hint, then try again.');
      setChoice('');
    }
  };
  const finish = (item: TrainingModule) => {
    const next = [...new Set([...done, item.id])];
    patchSettings({ trainingProgress: { ...progress, [learner]: next } });
    nav.pop();
  };

  if (!moduleId) {
    const completed = TRAINING_MODULES.filter(item => done.includes(item.id)).length;
    return (
      <Page title="Training mode" onBack={nav.pop} helpId="staff/training">
        <View style={{ paddingHorizontal: 16, paddingTop: 14, gap: 10 }}>
          <Txt size={23} weight="700">Learn at your own pace</Txt>
          <Txt sub>Choose any module. Your completion marks are saved for {staffId ? 'your staff account' : 'this register'}.</Txt>
          <Card style={{ padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Ionicons name="school-outline" size={28} color={c.accent} />
            <View style={{ flex: 1 }}><Txt weight="700">{completed} of {TRAINING_MODULES.length} complete</Txt><Txt size={12} sub>More app processes will be added as separate modules.</Txt></View>
          </Card>
        </View>
        {TRAINING_MODULES.length ? <Section title="Modules">
          {TRAINING_MODULES.map((item, i) => <Row key={item.id} icon={done.includes(item.id) ? 'checkmark-circle' : 'play-circle-outline'} title={item.title}
            sub={`${item.duration} · ${item.summary}${done.includes(item.id) ? ' · Complete' : ''}`} last={i === TRAINING_MODULES.length - 1} onPress={() => begin(item)} />)}
        </Section> : <Empty icon="school-outline" title="Training modules are being prepared" />}
      </Page>
    );
  }

  if (!module) return <Page title="Training module" onBack={nav.pop}><Empty title="Module not found" sub="It may have been removed in a newer training update." /></Page>;

  const stages: { id: Stage; label: string }[] = [
    { id: 'info', label: 'Info' }, { id: 'process', label: 'Process' }, { id: 'guide', label: 'Guide' }, { id: 'check', label: 'Check' }, { id: 'complete', label: 'Done' },
  ];
  const activeStage = stages.findIndex(item => item.id === stage);
  const stageNext = () => {
    if (stage === 'info') { if (slide < module.slides.length - 1) setSlide(slide + 1); else { setSlide(0); setStage('process'); } }
    else if (stage === 'process') { if (slide < module.flow.length - 1) setSlide(slide + 1); else { setSlide(0); setStage('guide'); } }
    else if (stage === 'guide' && guideDone) {
      setGuideDone(false);
      if (guide < module.guide.length - 1) setGuide(guide + 1); else { setScenario(0); setStage('check'); }
    }
  };
  const stageBack = () => {
    if (stage === 'info') { if (slide > 0) setSlide(slide - 1); else nav.pop(); }
    else if (stage === 'process') { if (slide > 0) setSlide(slide - 1); else { setStage('info'); setSlide(module.slides.length - 1); } }
    else if (stage === 'guide') { if (guide > 0) { setGuide(guide - 1); setGuideDone(false); } else { setStage('process'); setSlide(module.flow.length - 1); } }
    else if (stage === 'check') { setStage('guide'); setGuide(module.guide.length - 1); setChoice(''); setFeedback(''); }
    else if (stage === 'complete') nav.pop();
  };

  return (
    <Page title={module.title} onBack={stageBack} helpId={module.helpId}>
      <View style={{ padding: 14, gap: 12 }}>
        <View style={{ flexDirection: 'row', gap: 5 }} accessibilityRole="progressbar" accessibilityLabel={`${stages[activeStage].label}, stage ${activeStage + 1} of ${stages.length}`}>
          {stages.map((item, i) => <View key={item.id} style={{ flex: 1, gap: 4 }}>
            <View style={{ height: 5, borderRadius: 3, backgroundColor: i < activeStage ? c.good : i === activeStage ? c.accent : c.line }} />
            <Txt size={10} sub numberOfLines={1}>{item.label}</Txt>
          </View>)}
        </View>

        {stage === 'info' ? (() => {
          const item = module.slides[slide];
          return <Reveal key={`info-${slide}`}><Card style={{ padding: 20, gap: 14 }}>
            <View style={{ height: 130, borderRadius: 16, backgroundColor: c.fill, alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <Ionicons name={item.icon as React.ComponentProps<typeof Ionicons>['name']} size={42} color={c.accent} />
              <Txt size={12} sub weight="600">{item.caption}</Txt>
            </View>
            <Txt size={23} weight="700">{item.title}</Txt>
            <Txt size={16} sub>{item.body}</Txt>
            {slide === 0 ? <View style={{ gap: 8, borderTopWidth: 1, borderTopColor: c.line, paddingTop: 12 }}>
              <Txt weight="600">When you’ll use this</Txt><Txt sub>{module.when}</Txt><Txt weight="600">What you’ll learn</Txt><Txt sub>{module.outcome}</Txt>
            </View> : null}
            <Txt size={12} sub>Idea {slide + 1} of {module.slides.length}</Txt>
          </Card></Reveal>;
        })() : null}

        {stage === 'process' ? (() => {
          const item = module.flow[slide];
          return <Reveal key={`process-${slide}`}><Card style={{ padding: 20, gap: 14 }}>
            <View style={{ height: 150, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
              <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' }}><Txt size={25} weight="700" color={c.onAccent}>{slide + 1}</Txt></View>
              <View style={{ height: 20, width: 2, backgroundColor: c.line }} />
              {slide < module.flow.length - 1 ? <Ionicons name="arrow-down-circle" size={28} color={c.good} /> : <Ionicons name="checkmark-circle" size={28} color={c.good} />}
            </View>
            <Txt size={23} weight="700">{item.title}</Txt><Txt size={16} sub>{item.body}</Txt>
            <Txt size={12} sub>Step {slide + 1} of {module.flow.length}</Txt>
          </Card></Reveal>;
        })() : null}

        {stage === 'guide' ? (() => {
          const item = module.guide[guide];
          return <View style={{ gap: 12 }}>
            <Card style={{ padding: 16, gap: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Ionicons name="phone-portrait-outline" size={24} color={c.accent} /><Txt weight="700">Practice preview</Txt>
              </View>
              <Txt size={12} sub>This rehearsal is a safe mock-up. It does not change your live cart or take payment.</Txt>
              <View style={{ borderRadius: 14, backgroundColor: c.bg, borderWidth: 1, borderColor: c.line, padding: 14, gap: 10 }}>
                <Txt size={12} sub>CHECKOUT · PRACTICE</Txt>
                {guide > 0 ? <Row icon="cube-outline" title="Demo item" sub="Qty 1 · $12.00" last /> : null}
                <Pressable onPress={() => { setFeedback(item.feedback); setGuideDone(true); }} accessibilityRole="button" accessibilityLabel={item.button}
                  style={{ padding: 14, borderRadius: 12, backgroundColor: c.accent, alignItems: 'center' }}>
                  <Txt weight="700" color={c.onAccent}>{item.button}</Txt>
                </Pressable>
                {feedback ? <Txt size={13} color={c.good}>{feedback}</Txt> : null}
              </View>
            </Card>
            <Txt size={16} weight="700">{item.title}</Txt><Txt sub>{item.instruction}</Txt>
          </View>;
        })() : null}

        {stage === 'check' ? (() => {
          const item = module.scenarios[scenario];
          const correct = item.choices.find(option => option.id === item.answer);
          return <View style={{ gap: 12 }}>
            <Card style={{ padding: 18, gap: 10 }}>
              <Txt size={12} color={item.kind === 'recovery' ? c.warn : c.good} weight="700">{item.kind === 'recovery' ? 'RECOVERY SCENARIO' : 'SMOOTH SALE'} · {scenario + 1} OF {module.scenarios.length}</Txt>
              <Txt size={21} weight="700">{item.title}</Txt><Txt sub>{item.prompt}</Txt>
            </Card>
            {item.choices.map(option => {
              const selected = choice === option.id;
              const answer = showAnswer && item.answer === option.id;
              return <Pressable key={option.id} onPress={() => { setChoice(option.id); setFeedback(''); }} accessibilityRole="button" accessibilityState={{ selected }}
                style={{ padding: 14, borderRadius: 13, backgroundColor: answer ? c.good + '24' : selected ? c.fill : c.card, borderWidth: selected || answer ? 2 : 1, borderColor: answer ? c.good : selected ? c.accent : c.line }}>
                <Txt weight={answer ? '700' : '500'}>{option.label}{answer ? '  ✓' : ''}</Txt>
              </Pressable>;
            })}
            {hint > 0 ? <Card style={{ padding: 13, borderColor: c.accent }}><Txt size={13}>{item.hints[hint - 1] ?? `The best answer is: ${correct?.label ?? ''}`}</Txt></Card> : null}
            {feedback ? <Txt size={13} color={feedback === 'That’s right.' ? c.good : c.warn}>{feedback}</Txt> : null}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Btn title={hint >= item.hints.length ? 'Show answer' : 'Hint'} kind="secondary" icon="bulb-outline" style={{ flex: 1 }}
                onPress={() => { if (hint < item.hints.length) setHint(nextHintIndex(item.hints, hint)); else { setShowAnswer(true); setChoice(item.answer); setFeedback(`Answer revealed: ${correct?.label ?? ''}`); } }} />
              <Btn title="Check answer" disabled={!choice} style={{ flex: 1 }} onPress={() => submitChoice(module)} />
            </View>
          </View>;
        })() : null}

        {stage === 'complete' ? <Card style={{ padding: 10 }}>
          <Celebration message={module.celebration} />
          <Btn title="Mark complete" icon="checkmark-circle" onPress={() => finish(module)} />
        </Card> : null}

        {stage !== 'complete' ? <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Txt size={12} sub>{stage === 'check' ? 'Complete both scenarios to finish' : 'Your progress is saved when you complete this module.'}</Txt>
          {stage !== 'check' ? <Btn title={stage === 'guide' ? (guide < module.guide.length - 1 ? 'Next guide step' : 'Start practice') : 'Next'} icon="arrow-forward" small disabled={stage === 'guide' && !guideDone} onPress={stageNext} /> : null}
        </View> : null}
      </View>
    </Page>
  );
}
