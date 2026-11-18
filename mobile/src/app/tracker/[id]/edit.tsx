import { router, useLocalSearchParams } from 'expo-router';
import { Alert, Platform, View } from 'react-native';
import { TrackerForm } from '@/components/TrackerForm';
import { Button, Loading, Screen } from '@/components/ui';
import { useDeleteTracker, useTracker, useUpdateTracker } from '@/lib/queries';

export default function EditTracker() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: tracker, isLoading } = useTracker(id);
  const update = useUpdateTracker(id);
  const remove = useDeleteTracker();

  if (isLoading || !tracker) return <Loading />;

  const doDelete = () =>
    remove.mutate(id, {
      onSuccess: () => {
        router.dismissAll();
        router.replace('/(tabs)/trackers');
      },
    });

  const confirmDelete = () => {
    const msg = 'All history for this tracker will be deleted permanently.';
    if (Platform.OS === 'web') {
      if (globalThis.confirm?.(msg)) doDelete();
    } else
      Alert.alert('Delete tracker?', msg, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: doDelete },
      ]);
  };

  return (
    <Screen edges={['bottom']}>
      <TrackerForm
        initial={{ type: tracker.type, category: tracker.category, name: tracker.name, icon: tracker.icon, color: tracker.color, config: tracker.config }}
        submitLabel="Save changes"
        submitting={update.isPending}
        error={update.error?.message}
        onSubmit={(d) => update.mutate({ name: d.name, category: d.category, icon: d.icon, color: d.color, config: d.config }, { onSuccess: () => router.back() })}
      />
      <View style={{ gap: 10, marginTop: 28 }}>
        <Button
          title={tracker.archived ? 'Unarchive' : 'Archive (hide, keep history)'}
          variant="secondary"
          icon="archive-outline"
          onPress={() => update.mutate({ archived: !tracker.archived }, { onSuccess: () => router.back() })}
        />
        <Button title="Delete tracker" variant="ghost" icon="delete-outline" onPress={confirmDelete} />
      </View>
    </Screen>
  );
}
