const fs = require('fs');
const content = fs.readFileSync('src/App.tsx', 'utf8');
const start = content.indexOf('const AdminDashboardView = ({');
const end = content.indexOf('const getRemainingDays = (dueDate?: string | null) => {');
if (start !== -1 && end !== -1) {
  const newContent = content.substring(0, start) + content.substring(end);
  fs.writeFileSync('src/App.tsx', newContent);
  console.log('Removed AdminDashboardView');
} else {
  console.log('Could not find start or end');
}
