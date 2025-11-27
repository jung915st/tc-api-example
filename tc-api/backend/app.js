const express = require("express");
const cors = require("cors");
const config = require("./config");
const studentRoutes = require("./routes/students");
const syncApi = require("./routes/sync");
const classApi = require("./routes/classes");
const teacherApi = require("./routes/teachers");
const scoreRoutes = require("./routes/scores");

const app = express();
app.use(cors());
app.use(express.json());

app.use("/api/students", studentRoutes);
app.use("/api/sync-school", syncApi);
app.use("/api/classes", classApi);
app.use("/api/teachers", teacherApi);
app.use("/api/scores", scoreRoutes);

app.listen(config.port, () => {
  console.log("Backend running on http://localhost:" + config.port);
});
