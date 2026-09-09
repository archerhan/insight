import { config } from 'dotenv';
import { main } from './demo';

config({ path: ['.env.local', '.env'] });

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
