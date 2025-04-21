import tkinter as tk
from tkinter import messagebox
import sqlite3

# Initialize the main application window
root = tk.Tk()
root.title('Login System')
root.geometry('400x300')

# Connect to SQLite database (or create it if it doesn't exist)
conn = sqlite3.connect('users.db')
cursor = conn.cursor()

# Create users table if it doesn't exist
cursor.execute('''
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL,
    approved INTEGER DEFAULT 0
)
''')
conn.commit()

# Define a common style for buttons
button_style = {'font': ('Arial', 12), 'bg': '#4CAF50', 'fg': 'white', 'activebackground': '#45a049'}

# Update the main application window
root.configure(bg='#f0f0f0')

# Add a frame for the login and create account buttons
main_frame = tk.Frame(root, bg='#f0f0f0')
main_frame.pack(expand=True)

# Function to handle login
def login():
    # Create a new window for login
    login_window = tk.Toplevel(root)
    login_window.title('Login')
    login_window.geometry('300x200')

    # Labels and entry fields
    tk.Label(login_window, text='Email').pack(pady=5)
    email_entry = tk.Entry(login_window)
    email_entry.pack(pady=5)

    tk.Label(login_window, text='Password').pack(pady=5)
    password_entry = tk.Entry(login_window, show='*')
    password_entry.pack(pady=5)

    def submit_login():
        email = email_entry.get()
        password = password_entry.get()

        if email == 'admin' and password == 'duggy1!':
            messagebox.showinfo('Login Success', 'Welcome, Shaurya Duggal')
            admin_dashboard()
            login_window.destroy()
            return

        cursor.execute('SELECT name, role, approved FROM users WHERE email = ?', (email,))
        user = cursor.fetchone()

        if user:
            name, role, approved = user
            if role == 'Teacher' and not approved:
                messagebox.showerror('Error', 'Account pending approval')
            else:
                messagebox.showinfo('Login Success', f'Welcome, {name}')
                if role == 'Student':
                    student_dashboard(name)
                elif role == 'Teacher':
                    teacher_dashboard(name)
                login_window.destroy()
        else:
            messagebox.showerror('Error', 'Invalid credentials')

    tk.Button(login_window, text='Submit', command=submit_login).pack(pady=20)

# Function to handle account creation
def create_account():
    # Create a new window for account creation
    create_window = tk.Toplevel(root)
    create_window.title('Create Account')
    create_window.geometry('300x250')
    create_window.configure(bg='#f0f0f0')

    form_frame = tk.Frame(create_window, bg='#f0f0f0')
    form_frame.pack(expand=True)

    tk.Label(form_frame, text='Name', bg='#f0f0f0').pack(pady=5)
    name_entry = tk.Entry(form_frame)
    name_entry.pack(pady=5)

    tk.Label(form_frame, text='Email', bg='#f0f0f0').pack(pady=5)
    email_entry = tk.Entry(form_frame)
    email_entry.pack(pady=5)

    tk.Label(form_frame, text='Role', bg='#f0f0f0').pack(pady=5)
    role_var = tk.StringVar(value='Student')
    tk.Radiobutton(form_frame, text='Student', variable=role_var, value='Student', bg='#f0f0f0').pack()
    tk.Radiobutton(form_frame, text='Teacher', variable=role_var, value='Teacher', bg='#f0f0f0').pack()

    def submit_account():
        name = name_entry.get()
        email = email_entry.get()
        role = role_var.get()

        if not name or not email:
            messagebox.showerror('Error', 'Please fill all fields')
            return

        try:
            cursor.execute('INSERT INTO users (name, email, role) VALUES (?, ?, ?)', (name, email, role))
            conn.commit()
            if role == 'Teacher':
                messagebox.showinfo('Account Created', 'Waiting for admin approval')
            else:
                messagebox.showinfo('Account Created', 'Account created successfully')
            create_window.destroy()
        except sqlite3.IntegrityError:
            messagebox.showerror('Error', 'Email already exists')

    tk.Button(form_frame, text='Submit', command=submit_account, **button_style).pack(pady=20, ipadx=10, ipady=5)

# Placeholder functions for dashboards
def admin_dashboard():
    # Create a new window for the admin dashboard
    admin_window = tk.Toplevel(root)
    admin_window.title('Admin Dashboard')
    admin_window.geometry('400x300')

    tk.Label(admin_window, text='Welcome, Shaurya Duggal').pack(pady=10)

    # List pending teacher requests
    tk.Label(admin_window, text='Pending Teacher Requests:').pack(pady=5)
    pending_listbox = tk.Listbox(admin_window)
    pending_listbox.pack(pady=5, fill=tk.BOTH, expand=True)

    cursor.execute('SELECT id, name, email FROM users WHERE role = "Teacher" AND approved = 0')
    pending_teachers = cursor.fetchall()

    for teacher in pending_teachers:
        pending_listbox.insert(tk.END, f'{teacher[1]} ({teacher[2]})')

    def approve_teacher():
        selected_index = pending_listbox.curselection()
        if not selected_index:
            messagebox.showerror('Error', 'No teacher selected')
            return
        teacher_id = pending_teachers[selected_index[0]][0]
        cursor.execute('UPDATE users SET approved = 1 WHERE id = ?', (teacher_id,))
        conn.commit()
        messagebox.showinfo('Success', 'Teacher approved')
        pending_listbox.delete(selected_index)

    def remove_teacher():
        selected_index = pending_listbox.curselection()
        if not selected_index:
            messagebox.showerror('Error', 'No teacher selected')
            return
        teacher_id = pending_teachers[selected_index[0]][0]
        cursor.execute('DELETE FROM users WHERE id = ?', (teacher_id,))
        conn.commit()
        messagebox.showinfo('Success', 'Teacher removed')
        pending_listbox.delete(selected_index)

    tk.Button(admin_window, text='Approve', command=approve_teacher).pack(side=tk.LEFT, padx=10, pady=10)
    tk.Button(admin_window, text='Remove', command=remove_teacher).pack(side=tk.RIGHT, padx=10, pady=10)

def student_dashboard(name):
    # Create a new window for the student dashboard
    student_window = tk.Toplevel(root)
    student_window.title('Student Dashboard')
    student_window.geometry('300x200')

    tk.Label(student_window, text=f'Welcome, {name}').pack(pady=20)

def teacher_dashboard(name):
    # Create a new window for the teacher dashboard
    teacher_window = tk.Toplevel(root)
    teacher_window.title('Teacher Dashboard')
    teacher_window.geometry('300x200')

    tk.Label(teacher_window, text=f'Welcome, {name}').pack(pady=20)

# Add login and create account buttons
login_button = tk.Button(main_frame, text='Login', command=login, **button_style)
login_button.pack(pady=10, ipadx=10, ipady=5)

create_account_button = tk.Button(main_frame, text='Create Account', command=create_account, **button_style)
create_account_button.pack(pady=10, ipadx=10, ipady=5)

# Start the Tkinter event loop
root.mainloop() 