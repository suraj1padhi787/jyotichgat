const express = require('express');

const session = require('express-session');
const fileUpload = require('express-fileupload');
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

// DB Setup
const db = new sqlite3.Database('./chat.db');
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user TEXT, msg TEXT, image TEXT, voice TEXT,
    time TEXT, reply TEXT, status TEXT
  )`);
});

const users = JSON.parse(fs.readFileSync('./users.json', 'utf8'));

// Middleware

app.use(express.urlencoded({ extended: true }));
app.use(fileUpload());
app.use(express.static('public'));
app.set('view engine', 'ejs');
app.use(session({ secret: 'chatappsecret', resave: false, saveUninitialized: true }));

let onlineUsers = {};
let lastSeen = { suraj: 'Offline', jyoti: 'Offline' };

// Routes
app.get('/', (req, res) => res.render('login'));

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (users[username] && users[username] === password) {
    req.session.user = username;
    res.redirect('/chat');
  } else {
    res.send('Invalid credentials');
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

app.get('/chat', (req, res) => {
  const user = req.session.user;
  if (!user || !users[user]) return res.redirect('/');
  db.all("SELECT * FROM messages", [], (err, rows) => {
    res.render('chat', { user, lastSeen, chats: rows });
  });
});

app.get('/profile', (req, res) => {
  const user = req.session.user;
  if (!user || !users[user]) return res.redirect('/');
  res.render('profile', { user });
});

app.post('/profile', (req, res) => {
  const user = req.session.user;
  if (!req.files?.pic || !user) return res.redirect('/');
  const filename = `${user}.png`;
  req.files.pic.mv(__dirname + `/public/profiles/${filename}`, () => {
    res.redirect('/chat');
  });
});

app.post('/upload', (req, res) => {
  if (!req.files?.file) return res.send({ status: 'error' });
  const file = req.files.file;
  const name = Date.now() + '_' + file.name;
  file.mv(__dirname + '/public/uploads/' + name, () => {
    res.send({ status: 'success', filename: name });
  });
});

app.post('/upload-voice', (req, res) => {
  if (!req.files?.voice) return res.send({ status: 'error' });
  const name = Date.now() + '_voice.webm';
  req.files.voice.mv(__dirname + '/public/uploads/' + name, () => {
    res.send({ status: 'success', filename: name });
  });
});

// ✅ Sticker Routes
app.get('/get-animated-stickers', (req, res) => {
  const dir = path.join(__dirname, '/public/stickers');
  fs.readdir(dir, (err, files) => {
    if (err) return res.json([]);
    res.json(files);
  });
});
app.post('/upload-animated-sticker', (req, res) => {
  const user = req.session.user;
  if (!user || !req.files?.sticker) return res.send({ status: 'error', msg: 'Login required or no file' });
  const file = req.files.sticker;
  const name = Date.now() + '_' + file.name;
  file.mv(__dirname + '/public/stickers/' + name, () => {
    res.send({ status: 'success', filename: name });
  });
});


app.delete('/delete-sticker/:file', (req, res) => {
  const file = req.params.file;
  const filepath = path.join(__dirname, 'public', 'stickers', file);
  fs.unlink(filepath, err => {
    if (err) return res.status(500).send('Failed to delete');
    res.send('Deleted');
  });
});

// ✅ SOCKET.IO Setup
io.on('connection', (socket) => {
  socket.on('join', ({ user }) => {
    onlineUsers[user] = socket.id;
    lastSeen[user] = new Date();
    io.emit('update-status', { user, status: 'online', lastSeen: lastSeen[user] });
  });

  socket.on('chat', (data) => {
    const time = new Date().toLocaleTimeString();
    const status = 'sent';

    // 🟡 Ensure image is saved as it is (e.g., 'funny.mp4'), but path added in frontend
    db.run("INSERT INTO messages (user, msg, image, voice, reply, time, status) VALUES (?,?,?,?,?,?,?)",
      [data.user, data.msg || null, data.image || null, data.voice || null, data.reply || null, time, status],
      function () {
        data.id = this.lastID;
        data.time = time;
        data.status = status;
        io.emit('chat', data);
      });
  });

  socket.on('seen', (id) => {
    db.get("SELECT * FROM messages WHERE id = ?", [id], (err, msg) => {
      if (msg?.status !== 'seen') {
        db.run("UPDATE messages SET status = ? WHERE id = ?", ['seen', id]);
        io.emit('status-update', { id, status: 'seen' });
      }
    });
  });

  socket.on('edit-message', (data) => {
    db.run("UPDATE messages SET msg = ? WHERE id = ? AND user = ?", [data.newMsg, data.id, data.user], () => {
      io.emit('edit-message', data);
    });
  });

  socket.on('delete-message', (data) => {
    db.run("DELETE FROM messages WHERE id = ? AND user = ?", [data.id, data.user], () => {
      io.emit('delete-message', data);
    });
  });

  socket.on('typing', (data) => {
    socket.broadcast.emit('typing', data);
  });

  socket.on('stop-typing', (data) => {
    socket.broadcast.emit('stop-typing', data);
  });

  socket.on('disconnect', () => {
    for (let user in onlineUsers) {
      if (onlineUsers[user] === socket.id) {
        lastSeen[user] = new Date();
        io.emit('update-status', { user, status: 'offline', lastSeen: lastSeen[user] });
        delete onlineUsers[user];
      }
    }
  });
});

// Start
http.listen(3000, () => console.log('✅ Server running at http://localhost:3000'));
