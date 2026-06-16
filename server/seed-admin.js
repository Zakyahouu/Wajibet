const mongoose = require('mongoose');
  const User = require('./models/User');
  require('dotenv').config();

  async function seed() {
    await mongoose.connect(process.env.MONGO_URI);

    const existing = await User.findOne({ email: 'admin@wajibet.com' });
    if (existing) {
      console.log('Admin already exists');
      process.exit(0);
    }

    await User.create({
      firstName: 'Super',
      lastName: 'Admin',
      email: 'admin@wajibet.com',
      password: 'changeme123',
      role: 'admin',
    });

    console.log('Admin created: admin@wajibet.com / changeme123');
    process.exit(0);
  }

  seed().catch(err => { console.error(err); process.exit(1); });
