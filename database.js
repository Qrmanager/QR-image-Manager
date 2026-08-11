const sqlite3 = require("sqlite3").verbose();

const db = new sqlite3.Database("./app.db", (err) => {
    if (err) {
        console.error("Database Connection Error:", err.message);
    } else {
        console.log("Connected to SQLite database.");
    }
});

// Single-line query prevents copy-paste invisible character errors
const createTableQuery = "CREATE TABLE IF NOT EXISTS images (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, idNumber TEXT, image TEXT, qr TEXT)";

db.run(createTableQuery, (err) => {
    if (err) {
        console.error("Table Creation Error:", err.message);
    } else {
        console.log("Database table is ready.");
    }
});

module.exports = db;
