import React, { useEffect, useState } from 'react';

import { ListGroup, ListRow } from '../../components/ui';
import { anythingNew } from './checks';

// The way into the update screen from Settings, marked "Update" when there's
// something to install. Checks quietly once per visit to Settings.
export function UpdateSettingsLink({ navigation }: any) {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    let live = true;
    anythingNew().then((v) => live && setAvailable(v));
    return () => {
      live = false;
    };
  }, []);

  return (
    <ListGroup title="Updates">
      <ListRow icon="download" label="App updates" badge={available ? 'Update' : undefined} onPress={() => navigation.navigate('AppUpdate')} />
    </ListGroup>
  );
}
