import { render } from "preact";
import { App } from "./app.js";
import "vis-timeline/styles/vis-timeline-graph2d.min.css";
import "./styles.css";

const root = document.getElementById("app");
if (root) render(<App />, root);
