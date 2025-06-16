
import { activeWindow, openWindows } from 'get-windows';

async function main() {
  const command = process.argv[2];
  
  try {
    if (command === 'active') {
      const active = await activeWindow();
      console.log(JSON.stringify(active || {}));
    } else if (command === 'all') {
      const windows = await openWindows();
      console.log(JSON.stringify(windows || []));
    } else {
      console.error('Unknown command');
      process.exit(1);
    }
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

main();
