// This script sets up the initial admin account
const setupAdmin = () => {
  const adminUser = {
    name: 'Admin',
    email: 'admin@example.com',
    password: 'admin123',
    role: 'admin',
    approved: true,
    created: new Date().toISOString()
  };

  // Get existing users or create new array
  const users = JSON.parse(localStorage.getItem('users') || '[]');
  
  // Check if admin already exists
  const adminExists = users.some(user => user.role === 'admin');
  
  if (!adminExists) {
    users.push(adminUser);
    localStorage.setItem('users', JSON.stringify(users));
    console.log('Admin account created successfully');
  } else {
    console.log('Admin account already exists');
  }
};

// Run setup
setupAdmin(); 