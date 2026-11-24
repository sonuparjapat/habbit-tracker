import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { Button, Chip, haptic, Icon, Input, Row, Screen, Txt } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { APP_VERSION } from '@/lib/config';
import { sendFeedback } from '@/lib/queries';
import { colors } from '@/theme';

const KINDS = [
  { key: 'bug', label: 'Something’s broken', icon: '🐞' },
  { key: 'idea', label: 'I have an idea', icon: '💡' },
  { key: 'question', label: 'I have a question', icon: '❓' },
  { key: 'other', label: 'Something else', icon: '💬' },
] as const;

export default function Feedback() {
  const user = useAuth((s) => s.user);
  const [kind, setKind] = useState<(typeof KINDS)[number]['key']>('idea');
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async () => {
    setError(null);
    setSending(true);
    try {
      await sendFeedback({ kind, message: message.trim(), email: user ? undefined : email.trim(), appVersion: APP_VERSION, platform: Platform.OS });
      haptic.success();
      setSent(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSending(false);
    }
  };

  if (sent)
    return (
      <Screen edges={['bottom']} scroll={false} contentStyle={{ justifyContent: 'center', alignItems: 'center', gap: 14 }}>
        <View style={{ width: 76, height: 76, borderRadius: 38, backgroundColor: colors.greenSoft, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="check-bold" size={38} color={colors.green} />
        </View>
        <Txt variant="title" center>Thank you!</Txt>
        <Txt variant="caption" center style={{ maxWidth: 300 }}>We read every message. If you asked something, we’ll reply to {user?.email ?? email}.</Txt>
        <Button title="Done" onPress={() => router.back()} style={{ alignSelf: 'stretch', marginTop: 10 }} />
      </Screen>
    );

  const valid = message.trim().length >= 5 && (user || email.includes('@'));

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen edges={['bottom']} contentStyle={{ gap: 18, paddingTop: 16 }}>
        <Txt variant="caption">Tell us what’s working, what isn’t, or what you wish Holdfast did. It goes straight to the team.</Txt>
        <Row gap={8} style={{ flexWrap: 'wrap' }}>
          {KINDS.map((k) => (
            <Chip key={k.key} label={k.label} icon={k.icon} selected={kind === k.key} onPress={() => setKind(k.key)} />
          ))}
        </Row>
        <Input
          label="Your message"
          value={message}
          onChangeText={setMessage}
          multiline
          maxLength={4000}
          placeholder={kind === 'bug' ? 'What happened, and what did you expect?' : 'Write as much as you like…'}
          style={{ minHeight: 140 }}
        />
        {!user ? <Input label="Your email (so we can reply)" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" /> : null}
        {error ? <Txt variant="caption" color={colors.red}>{error}</Txt> : null}
        <Button title="Send" icon="send" loading={sending} disabled={!valid} onPress={submit} />
        <Txt variant="caption" center style={{ fontSize: 12 }}>App version {APP_VERSION} · {Platform.OS} is attached to help us fix bugs.</Txt>
      </Screen>
    </KeyboardAvoidingView>
  );
}
