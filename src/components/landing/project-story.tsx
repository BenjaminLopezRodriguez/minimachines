"use client";

import { useState } from "react";
import {
  ArrowRight,
  Check,
  FileCode2,
  FileText,
  MessageCircle,
  RotateCcw,
} from "lucide-react";
import { BrandMark } from "~/components/brand-mark";

const examples = [
  {
    name: "Build a page",
    brief: "Help me put together a page for my next launch.",
    response: "A small page, ready for your words and ideas.",
    question: "What should visitors do first?",
    choices: ["Join the waitlist", "Explore the project"],
    result: "Launch page",
    detail: "Preview and files to review",
    icon: FileCode2,
  },
  {
    name: "Fix a bug",
    brief: "The signup form gets stuck. Can you take a look?",
    response: "A workspace to reproduce it and check a fix.",
    question: "What should happen after signup?",
    choices: ["Show a thank-you", "Open the dashboard"],
    result: "Signup fix",
    detail: "Changes and checks to review",
    icon: FileCode2,
  },
  {
    name: "Make a report",
    brief: "Turn this project’s CSV into a report I can share.",
    response: "Your files, with room to make sense of them.",
    question: "Who is the report for?",
    choices: ["Our team", "Our client"],
    result: "Project report",
    detail: "A document to open and share",
    icon: FileText,
  },
];

export function ProjectStory() {
  const [selected, setSelected] = useState(0);
  const [answer, setAnswer] = useState<string | null>(null);
  const example = examples[selected]!;
  const ResultIcon = example.icon;
  return (
    <div
      className="mm-story"
      aria-label="Interactive example of the project workflow"
    >
      <div className="mm-story-bar">
        <span>
          <BrandMark className="mm-brand-mark" /> A small project
        </span>
        <span>Interactive example</span>
      </div>
      <div
        className="mm-story-choices"
        role="group"
        aria-label="Choose an example project"
      >
        {examples.map((item, index) => (
          <button
            key={item.name}
            type="button"
            aria-pressed={selected === index}
            onClick={() => {
              setSelected(index);
              setAnswer(null);
            }}
          >
            {item.name}
          </button>
        ))}
      </div>
      <div className="mm-story-conversation">
        <div className="mm-story-brief">
          <span>You</span>
          <p>{example.brief}</p>
        </div>
        <div className="mm-story-agent">
          <BrandMark className="mm-brand-mark" />
          <div>
            <span>minimachines</span>
            <p>{example.response}</p>
          </div>
        </div>
        <div
          className="mm-story-decision"
          aria-live="polite"
          aria-atomic="true"
        >
          {answer ? (
            <>
              <span className="mm-story-caption">
                <Check size={15} aria-hidden="true" /> Your direction, carried
                forward
              </span>
              <p>{answer}</p>
              <button
                type="button"
                className="mm-story-reset"
                onClick={() => setAnswer(null)}
              >
                <RotateCcw size={13} aria-hidden="true" /> Try another answer
              </button>
            </>
          ) : (
            <>
              <span className="mm-story-caption">
                <MessageCircle size={15} aria-hidden="true" /> A quick baton
                question
              </span>
              <p>{example.question}</p>
              <div className="mm-story-answers">
                {example.choices.map((choice) => (
                  <button
                    type="button"
                    key={choice}
                    onClick={() => setAnswer(choice)}
                  >
                    {choice}
                    <ArrowRight size={14} aria-hidden="true" />
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        <div className="mm-story-result">
          <span className="mm-story-file">
            <ResultIcon size={21} strokeWidth={1.5} aria-hidden="true" />
          </span>
          <div>
            <strong>{example.result}</strong>
            <span>{example.detail}</span>
          </div>
          <span className="mm-story-result-label">Example output</span>
        </div>
      </div>
      <p className="mm-story-note">
        An illustration of the workflow. This example doesn’t run an agent or
        create a machine.
      </p>
    </div>
  );
}
