import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { TrackerForm, type TrackerDraft } from '@/components/TrackerForm';
import { Card, Icon, Row, Screen, SectionTitle, TrackerIcon, Txt } from '@/components/ui';
import { useCreateTracker } from '@/lib/queries';
import { defaultHabitConfig, defaultTradingConfig, TEMPLATES, type Template } from '@/lib/templates';
import { colors } from '@/theme';

function fromTemplate(t: Template): TrackerDraft {
  return {
    type: t.type,
    name: t.name,
    icon: t.icon,
    color: t.color,
    config: t.type === 'trading' ? { ...defaultTradingConfig, ...(t.config as object) } : { ...defaultHabitConfig, ...(t.config as object) },
  };
}

export default function NewTracker() {
  const [draft, setDraft] = useState<TrackerDraft | null>(null);
  const create = useCreateTracker();

  if (draft) {
    return (
      <Screen edges={['bottom']}>
        <TrackerForm
          initial={draft}
          submitLabel="Create tracker"
          submitting={create.isPending}
          error={create.error?.message}
          onSubmit={(d) =>
            create.mutate(d, {
              onSuccess: ({ tracker }) => router.replace(`/tracker/${tracker.id}`),
            })
          }
        />
      </Screen>
    );
  }

  const trading = TEMPLATES.filter((t) => t.type === 'trading');
  const habits = TEMPLATES.filter((t) => t.type === 'habit');

  const tile = (t: Template) => (
    <Card key={t.id} onPress={() => setDraft(fromTemplate(t))}>
      <Row gap={12}>
        <TrackerIcon icon={t.icon} color={t.color} />
        <View style={{ flex: 1 }}>
          <Txt variant="h3">{t.name}</Txt>
          <Txt variant="caption">{t.subtitle}</Txt>
        </View>
        <Icon name="chevron-right" color={colors.textDim} />
      </Row>
    </Card>
  );

  return (
    <Screen edges={['bottom']}>
      <Txt variant="caption">Start from a template — you can change every rule on the next screen.</Txt>

      <SectionTitle>Trading discipline</SectionTitle>
      <View style={{ gap: 10 }}>
        {trading.map(tile)}
        <Card
          onPress={() =>
            setDraft({ type: 'trading', name: '', icon: 'chart-line', color: '#22C55E', config: { ...defaultTradingConfig } })
          }>
          <Row gap={12}>
            <TrackerIcon icon="tune-variant" color={colors.textMuted} />
            <Txt variant="h3" style={{ flex: 1 }}>Custom trading plan</Txt>
            <Icon name="chevron-right" color={colors.textDim} />
          </Row>
        </Card>
      </View>

      <SectionTitle>Habits</SectionTitle>
      <View style={{ gap: 10 }}>
        {habits.map(tile)}
        <Card onPress={() => setDraft({ type: 'habit', name: '', icon: 'target', color: '#7C5CFF', config: { ...defaultHabitConfig } })}>
          <Row gap={12}>
            <TrackerIcon icon="plus" color={colors.textMuted} />
            <Txt variant="h3" style={{ flex: 1 }}>Custom habit</Txt>
            <Icon name="chevron-right" color={colors.textDim} />
          </Row>
        </Card>
      </View>
    </Screen>
  );
}
