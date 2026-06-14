const { exec } = require('child_process');

exec('netstat -ano | findstr :3000', (error, stdout, stderr) => {
  if (error || !stdout) {
    // No process found on port 3000
    return;
  }

  const lines = stdout.split('\n');
  lines.forEach(line => {
    const parts = line.trim().split(/\s+/);
    const pid = parts[parts.length - 1];
    if (pid && !isNaN(pid)) {
      exec(`taskkill /F /PID ${pid}`, (err) => {
        if (err) {
          console.log(`Could not kill process ${pid}`);
        } else {
          console.log(`Killed process ${pid} on port 3000`);
        }
      });
    }
  });
});
