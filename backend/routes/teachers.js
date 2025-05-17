router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Verify teacher exists and password is correct
    const teacher = await Teacher.findOne({ email });
    if (!teacher || !await teacher.comparePassword(password)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate JWT token
    const token = generateToken(teacher);

    res.json({
      token,
      user: {
        id: teacher._id,
        email: teacher.email,
        name: teacher.name,
        role: teacher.role
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});