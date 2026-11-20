import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { Share, View } from 'react-native';
import { Button, Card, ErrorView, Gradient, haptic, Icon, Loading, Row, Screen, SectionTitle, Txt } from '@/components/ui';
import { useAppConfig } from '@/lib/config';
import { useInvites } from '@/lib/queries';
import { gradients } from '@/theme';

/** Invite friends: share your code; you both win once they join and verify their email. */
export default function Invite() {
  const { data, isLoading, error, refetch } = useInvites();
  const { settings } = useAppConfig();
  const [copied, setCopied] = useState(false);

  if (isLoading) return <Loading />;
  if (error || !data) return <Screen edges={['bottom']}><ErrorView error={error} onRetry={refetch} /></Screen>;

  const link = settings.play_store_url || settings.website_url;
  const message = `I'm building better habits with Anchor — streaks, a forest that grows with every promise kept, and a weekly boss to beat. Join me with my code ${data.code}${link ? `: ${link}` : ''}`;

  const copy = async () => {
    await Clipboard.setStringAsync(data.code);
    haptic.success();
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Screen edges={['bottom']} contentStyle={{ gap: 16, paddingTop: 12 }} onRefresh={refetch}>
      <Gradient colors={gradients.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} sheen glow="#7C5CFF" style={{ borderRadius: 28, padding: 24, alignItems: 'center', gap: 8 }}>
        <Txt style={{ fontSize: 54 }}>🤝</Txt>
        <Txt variant="title" center>Better together</Txt>
        <Txt center>Habits stick when a friend is in it too. When someone joins with your code and verifies their email, you get +{data.xpPerFriend} XP.</Txt>
      </Gradient>

      <Card style={{ alignItems: 'center', gap: 10 }}>
        <Txt variant="label">Your invite code</Txt>
        <Txt style={{ fontSize: 34, fontWeight: '800', letterSpacing: 6 }}>{data.code}</Txt>
        <Button title={copied ? 'Copied!' : 'Copy code'} icon={copied ? 'check' : 'content-copy'} variant="secondary" small onPress={copy} />
      </Card>

      <Button title="Share with friends" icon="share-variant" onPress={() => Share.share({ message }).catch(() => {})} />

      <SectionTitle>Your friends</SectionTitle>
      <Card>
        <Row style={{ justifyContent: 'space-around' }}>
          <View style={{ alignItems: 'center', gap: 2 }}>
            <Txt variant="h2">{data.joined}</Txt>
            <Txt variant="caption">joined</Txt>
          </View>
          <View style={{ alignItems: 'center', gap: 2 }}>
            <Txt variant="h2">{data.pending}</Txt>
            <Txt variant="caption">not verified yet</Txt>
          </View>
        </Row>
      </Card>
      <Row gap={8}>
        <Icon name="information-outline" size={16} />
        <Txt variant="caption" style={{ flex: 1 }}>Friends enter your code when they sign up. It counts once they verify their email.</Txt>
      </Row>
    </Screen>
  );
}
