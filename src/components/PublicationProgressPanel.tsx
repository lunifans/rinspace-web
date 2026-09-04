import { publicAsset } from "@/app/config/env";
import { formatDate, formatNumber } from "@/i18n/format";
import { useOptionalLanguage } from "@/i18n/LanguageProvider";
import { resolveLocale } from "@/i18n/resolveLocale";
import {
  AnimateArrowUpRight,
  AnimateBell,
  AnimateButton,
  AnimateChevronDown,
  AnimateCircleAlert,
  AnimateHeartHandshake,
  AnimateSearch,
  AnimateSparkles,
  rinMotion,
} from "components/ui";
import type { PublicationProgress } from "@/services/publicationProgress";
import type { TFunction } from "i18next";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import React, { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import "./PublicationProgressPanel.scss";

export type PublicationProgressPanelProps = {
  progress: PublicationProgress | null;
};

const stageKeys: Record<string, string> = {
  queue: "publication.stages.queue",
  source_prepare: "publication.stages.source_prepare",
  document_compile: "publication.stages.document_compile",
  asset_process: "publication.stages.asset_process",
  store: "publication.stages.store",
};

function stageLabel(stage: string, t: TFunction<"common">) {
  return t(stageKeys[stage] || "publication.stages.fallback");
}

function durationLabel(seconds: number, locale: "zh-CN" | "en", t: TFunction<"common">) {
  if (seconds < 60) {
    return t("publication.duration.seconds", {
      count: seconds,
      displayCount: formatNumber(locale, seconds),
    });
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return t("publication.duration.minutes", {
      count: minutes,
      displayCount: formatNumber(locale, minutes),
    });
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return t("publication.duration.hoursMinutes", {
    displayHours: formatNumber(locale, hours),
    displayMinutes: formatNumber(locale, remainingMinutes),
  });
}

function timeLabel(value: string, locale: "zh-CN" | "en") {
  return formatDate(locale, value, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function estimateRangeLabel(earliest: string, latest: string, locale: "zh-CN" | "en") {
  const start = timeLabel(earliest, locale);
  const finish = timeLabel(latest, locale);
  return start === finish ? start : `${start}–${finish}`;
}

function panelCopy(
  progress: PublicationProgress,
  locale: "zh-CN" | "en",
  t: TFunction<"common">,
) {
  switch (progress.state) {
    case "awaiting_event":
      return {
        title: t("publication.awaitingEvent.title"),
        detail: progress.displayingPreviousVersion
          ? t("publication.awaitingEvent.previous")
          : t("publication.awaitingEvent.waiting"),
      };
    case "validating":
      return {
        title: t("publication.validating.title"),
        detail: t("publication.validating.detail"),
      };
    case "queued": {
      const ahead = progress.queue.jobsAheadEstimate;
      if (typeof ahead !== "number") {
        return {
          title: t("publication.queued.title"),
          detail: t("publication.queued.waiting"),
        };
      }
      const eta = progress.queue.estimate
        ? ` · ${estimateRangeLabel(
            progress.queue.estimate.estimatedStartRange.earliest,
            progress.queue.estimate.estimatedStartRange.latest,
            locale,
          )}`
        : "";
      return {
        title: t("publication.queued.title"),
        detail: t("publication.queued.ahead", {
          count: ahead,
          displayCount: formatNumber(locale, ahead),
          eta,
        }),
      };
    }
    case "running":
      return {
        title: t("publication.running"),
        detail: `${stageLabel(progress.run.stage, t)} · ${durationLabel(progress.run.elapsedSeconds, locale, t)}`,
      };
    case "activating":
      return {
        title: t("publication.activating.title"),
        detail: progress.displayingPreviousVersion
          ? t("publication.awaitingEvent.previous")
          : t("publication.activating.switching"),
      };
    case "failed":
      return {
        title: t("publication.failed.title"),
        detail: progress.view === "author"
          ? t("publication.failed.diagnostics")
          : t("publication.awaitingEvent.previous"),
      };
    case "reconciliation_required":
      return {
        title: t("publication.reconciliation.title"),
        detail: t("publication.awaitingEvent.previous"),
      };
    case "published":
      return {
        title: t("publication.published.title"),
        detail: t("publication.published.detail"),
      };
    case "superseded":
      return null;
  }
}

function statusIcon(
  state: PublicationProgress["state"],
  reducedMotion: boolean,
) {
  const animate = !reducedMotion;
  switch (state) {
    case "failed":
      return <AnimateCircleAlert size={17} animateOnView={animate} />;
    case "running":
    case "activating":
    case "published":
      return (
        <AnimateSparkles size={17} animate={animate} loop loopDelay={0.8} />
      );
    case "validating":
      return <AnimateSearch size={17} animateOnView={animate} />;
    case "reconciliation_required":
      return <AnimateSearch size={17} animation="find" animate={animate} />;
    default:
      return <AnimateBell size={17} animateOnView={animate} />;
  }
}

export function PublicationProgressPanel({
  progress,
}: PublicationProgressPanelProps) {
  const { i18n, t } = useTranslation("common");
  const language = useOptionalLanguage();
  const locale = language?.resolvedLocale
    ?? resolveLocale(i18n.resolvedLanguage || i18n.language, []);
  const titleId = useId();
  const diagnosticsId = useId();
  const [openedDiagnosticsKey, setOpenedDiagnosticsKey] = useState<
    string | null
  >(null);
  const reducedMotion = useReducedMotion();

  if (!progress) return null;
  const copy = panelCopy(progress, locale, t);
  if (!copy) return null;
  const active = ["queued", "running", "activating"].includes(progress.state);
  const authorFailure =
    progress.state === "failed" &&
    progress.view === "author" &&
    progress.author;
  const diagnosticsKey = `${progress.projectId}:${progress.updatedAt}`;
  const diagnosticsOpen = openedDiagnosticsKey === diagnosticsKey;

  return (
    <motion.section
      className={`publication-progress-panel state-${progress.state}`}
      aria-labelledby={titleId}
      initial={reducedMotion ? false : { opacity: 0, y: -6, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={rinMotion.spring}
    >
      <div
        className="publication-progress-live"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {copy.title}
      </div>

      <header className="publication-progress-head">
        <span className="publication-progress-mark" aria-hidden="true">
          {statusIcon(progress.state, Boolean(reducedMotion))}
        </span>
        <h2 id={titleId}>{copy.title}</h2>
      </header>
      <p className="publication-progress-detail">{copy.detail}</p>

      {progress.state === "running" ? (
        <div
          className="publication-progress-meter"
          aria-label={t("publication.completedStages", {
            displayCompleted: formatNumber(locale, progress.run.progress.completedStages),
            displayTotal: formatNumber(locale, progress.run.progress.totalStages),
          })}
        >
          <motion.span
            initial={reducedMotion ? false : { width: 0 }}
            animate={{
              width: `${Math.min(100, (progress.run.progress.completedStages / progress.run.progress.totalStages) * 100)}%`,
            }}
            transition={{
              duration: reducedMotion ? 0 : rinMotion.structural,
              ease: rinMotion.easeOut,
            }}
          />
        </div>
      ) : null}

      {authorFailure ? (
        <div className="publication-progress-diagnostics-shell">
          <AnimateButton
            unstyled
            type="button"
            className="publication-progress-diagnostics-trigger"
            aria-expanded={diagnosticsOpen}
            aria-controls={diagnosticsId}
            onClick={() =>
              setOpenedDiagnosticsKey(diagnosticsOpen ? null : diagnosticsKey)
            }
          >
            <span>
              {diagnosticsOpen
                ? t("publication.hideDiagnostics")
                : t("publication.showDiagnostics")}
            </span>
            <motion.span
              animate={{ rotate: diagnosticsOpen ? 180 : 0 }}
              transition={rinMotion.iconSpring}
              aria-hidden="true"
            >
              <AnimateChevronDown size={14} />
            </motion.span>
          </AnimateButton>
          <AnimatePresence initial={false}>
            {diagnosticsOpen ? (
              <motion.div
                id={diagnosticsId}
                className="publication-progress-diagnostics"
                initial={
                  reducedMotion ? false : { height: 0, opacity: 0, y: -4 }
                }
                animate={{ height: "auto", opacity: 1, y: 0 }}
                exit={
                  reducedMotion
                    ? { opacity: 0 }
                    : { height: 0, opacity: 0, y: -4 }
                }
                transition={{
                  duration: reducedMotion ? 0 : rinMotion.structural,
                  ease: rinMotion.easeOut,
                }}
              >
                {progress.author?.diagnostics[0] ? (
                  <p>
                    <code>{progress.author.diagnostics[0].code}</code>
                    <span>{progress.author.diagnostics[0].message}</span>
                  </p>
                ) : null}
                {progress.author?.diagnosticsPath ? (
                  <a href={progress.author.diagnosticsPath}>
                    {t("publication.openDiagnostics")}
                    <AnimateArrowUpRight
                      size={13}
                      animateOnHover={!reducedMotion}
                    />
                  </a>
                ) : null}
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      ) : null}

      {active ? (
        <footer className="publication-progress-support">
          <a href={publicAsset("/sponsor")}>
            <AnimateHeartHandshake size={14} animateOnHover={!reducedMotion} />
            <span>{t("publication.support")}</span>
            <AnimateArrowUpRight size={13} animateOnHover={!reducedMotion} />
          </a>
        </footer>
      ) : null}
    </motion.section>
  );
}

export default PublicationProgressPanel;
