import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { Button, Card, EmptyState, ErrorView, haptic, Loading, Row, Screen, TrackerIcon, Txt } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useApplyPack, useStarterPacks } from '@/lib/queries';
import { goSignIn } from '@/lib/requireAuth';
import type { StarterPack } from '@/lib/types';
import { colors } from '@/theme';

/** Starter packs: one tap adds a whole routine (managed in Admin → Starter packs). */
export default function Packs() {
  const { data, isLoading, error, refetch } = useStarterPacks();
  const signedIn = useAuth((s) => !!s.token);
  const apply = useApplyPack();
  const [busySlug, setBusySlug] = useState<string | null>(null);
  const [message, setMessage] = useState<{ slug: string; text: string; ok: boolean } | null>(null);

  if (isLoading) return <Loading variant="list" />;
  if (error) return <Screen edges={['bottom']}><ErrorView error={error} onRetry={refetch} /></Screen>;
  if (!data?.length) return <Screen edges={['bottom']}><EmptyState icon="package-variant" title="No packs right now" message="Create your own trackers instead." /></Screen>;

  const add = (pack: StarterPack) => {
    if (!signedIn) return goSignIn('register');
    setBusySlug(pack.slug);
    setMessage(null);
    apply.mutate(pack.slug, {
      onSuccess: (r) => {
        haptic.success();
        setMessage({ slug: pack.slug, ok: true, text: `Added ${r.trackers.length} tracker${r.trackers.length === 1 ? '' : 's'}${r.skipped ? ` (${r.skipped} you already had)` : ''}.` });
        setTimeout(() => router.navigate('/'), 900);
      },
      onError: (e) => setMessage({ slug: pack.slug, ok: false, text: e.message }),
      onSettled: () => setBusySlug(null),
    });
  };

  return (
    <Screen edges={['bottom']} contentStyle={{ gap: 14, paddingTop: 12 }}>
      <Txt variant="caption">Pick a routine — we’ll set up every tracker for you. You can change or remove any of them later.</Txt>
      {data.map((pack) => (
        <Card key={pack.slug} style={{ gap: 12 }}>
          <Row gap={12}>
            <Txt style={{ fontSize: 36 }}>{pack.emoji}</Txt>
            <View style={{ flex: 1, gap: 2 }}>
              <Txt variant="h3">{pack.name}</Txt>
              <Txt variant="caption">{pack.description}</Txt>
            </View>
          </Row>
          <View style={{ gap: 8 }}>
            {pack.trackers.map((t) => (
              <Row key={t.slug} gap={10}>
                <TrackerIcon icon={t.icon} color={t.color} size={30} />
                <View style={{ flex: 1 }}>
                  <Txt style={{ fontSize: 15, fontWeight: '600' }}>{t.name}</Txt>
                  {t.subtitle ? <Txt variant="caption" style={{ fontSize: 12 }}>{t.subtitle}</Txt> : null}
                </View>
              </Row>
            ))}
          </View>
          {message?.slug === pack.slug ? (
            <Txt variant="caption" color={message.ok ? colors.green : colors.red}>{message.text}</Txt>
          ) : null}
          <Button title={`Add ${pack.trackers.length} trackers`} icon="plus" loading={busySlug === pack.slug} disabled={!!busySlug} onPress={() => add(pack)} />
        </Card>
      ))}
    </Screen>
  );
}
