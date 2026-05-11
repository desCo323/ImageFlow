(function () {
  "use strict";

  const root = document.getElementById("imageflow-app");
  if (!root) {
    return;
  }

  const mount = root.querySelector(".imageflow-shell");
  const hasNextcloud = typeof window.OC !== "undefined" && typeof window.OC.generateUrl === "function";
  const DEFAULT_PRELOAD_RADIUS = 4;
  const THUMB_WINDOW = 16;
  const MAX_BUFFERED_IMAGES = 32;
  const PAGE_LIMIT = 48;
  const DEFAULT_TARGET_PATH = "/Photos";
  const imageBuffer = new Map();
  const imagePageCache = new Map();
  const imagePagePrefetches = new Map();
  let imagePageCacheGeneration = 0;
  let positionSaveTimer = null;
  let feedbackTimer = null;
  let imagePageLoadPromise = null;
  let targetSearchTimer = null;
  let scrollToTopOnRender = false;

  const state = {
    page: root.dataset.page || "jobs",
    jobId: numberOrNull(root.dataset.jobId),
    jobs: [],
    sortState: null,
    health: null,
    imageIndex: 0,
    pageCursor: null,
    imagePage: null,
    bufferPlan: [],
    targets: [],
    targetQuery: "",
    toast: null,
    feedback: null,
    decisionStreak: 0,
    decisionsThisSession: 0,
    decisionInFlight: false,
    decisionSourcePath: null,
    sessionStartedAt: Date.now(),
    loading: false,
    startMode: null,
    progressBaseline: null,
    acceptDecreasedCounters: false,
    logs: {
      loading: false,
      items: [],
      level: "",
      jobId: null,
      error: null,
    },
    adminSettings: {
      loading: false,
      saving: false,
      data: null,
      error: null,
    },
    mockFavorites: null,
    mockTargets: null,
    mockFolders: null,
    dragFavoriteId: null,
    targetCreateName: "",
    jobDraft: {
      editingJobId: null,
      name: "",
      sourcePath: "/Photos",
      targetMode: "album",
      targetPath: DEFAULT_TARGET_PATH,
      recursiveSource: false,
      safeMode: true,
      autoProcess: false,
      preloadMode: "balanced",
      targetOrdering: "relevance",
      hotkeys: "number-row",
      customHotkeys: ["", "", "", "", "", "", "", "", ""],
    },
    folderPicker: {
      open: false,
      field: null,
      path: "/",
      data: null,
      loading: false,
      error: null,
    },
    targetBrowsePath: null,
    targetFolderPage: null,
    targetCreateOpen: false,
    targetCreateBusy: false,
    worklist: {
      open: false,
      jobId: null,
      loading: false,
      preview: null,
      error: null,
      autoProcess: false,
      filter: "all",
      repairOpen: false,
    },
  };

  const UI_TRANSLATIONS = {
    en: {
      terms: {
        "ImageFlow Betrieb": "ImageFlow Operations",
        "Globale Servereinstellungen für Ablage, Automatik und Prüflast.": "Global server settings for filing, automation and load checks.",
        "Viele Bilder schnell durchsehen, entscheiden und sicher ablegen.": "Review many photos quickly, decide, and file them safely.",
        "Übersicht": "Overview",
        "Sortieren": "Sort",
        "Protokoll": "Log",
        "Foto-Flows": "Photo flows",
        "Schutzstatus": "Safety status",
        "Bereit für die nächste Bilderrunde?": "Ready for the next photo round?",
        "Lege einen Flow an, wähle Ordner und Zielart, und sortiere danach Bild für Bild.": "Create a flow, choose folder and filing type, then sort image by image.",
        "Flow anlegen": "Create flow",
        "Flow bearbeiten": "Edit flow",
        "Neuen Flow vorbereiten": "Prepare new flow",
        "Passe Name und Einstellungen an. Quelle und Ziel bleiben gesperrt, sobald Entscheidungen vorhanden sind.": "Change name and settings. Source and destination stay locked once decisions exist.",
        "Speichere den Flow zuerst oder spring direkt in den Sortiermodus.": "Save the flow first or jump straight into sorting.",
        "Name": "Name",
        "Bilderordner": "Image folder",
        "Auswählen": "Choose",
        "ImageFlow nutzt nur Ordner aus deinem Nextcloud-Dateibereich.": "ImageFlow only uses folders from your Nextcloud files.",
        "Unterordner mit einbeziehen": "Include subfolders",
        "Wie sollen sortierte Bilder abgelegt werden?": "How should sorted images be filed?",
        "Zu einem Album hinzufügen": "Add to an album",
        "In einen Ordner verschieben": "Move to a folder",
        "In einen Ordner kopieren": "Copy to a folder",
        "Zielordner": "Destination folder",
        "Mit Prüfsummen extra sicher prüfen": "Use extra-safe checksum verification",
        "Automatisch ablegen, wenn der Server ruhig ist": "File automatically when the server is quiet",
        "Vorschau laden": "Preview loading",
        "Schonend": "Light",
        "Ausgewogen": "Balanced",
        "Turbo für große Stapel": "Turbo for large batches",
        "Ziel-Reihenfolge": "Target order",
        "Passende Ziele zuerst": "Relevant targets first",
        "Alphabetisch": "Alphabetical",
        "Tastenbelegung": "Keyboard shortcuts",
        "Zahlen 1-9 und 0": "Numbers 1-9 and 0",
        "Buchstaben A-I und 0": "Letters A-I and 0",
        "Eigene Tasten": "Custom keys",
        "Eigene Schnellziel-Tasten": "Custom quick-target keys",
        "Jede Taste darf nur einmal vorkommen. 0 und Leertaste bleiben für Überspringen reserviert.": "Each key can only be used once. 0 and Space stay reserved for skipping.",
        "Änderungen speichern": "Save changes",
        "Flow speichern": "Save flow",
        "Speichern & loslegen": "Save and start",
        "Bearbeiten abbrechen": "Cancel editing",
        "Zurücksetzen": "Reset",
        "Deine Flows": "Your flows",
        "Fortschritt, Tempo und Ablage bleiben hier im Blick.": "Progress, pace and filing stay visible here.",
        "Neu laden": "Reload",
        "Flows": "Flows",
        "Entschieden": "Decided",
        "Wartet": "Waiting",
        "Ausführbar": "Ready to run",
        "Fehler": "Errors",
        "Flow": "Flow",
        "Ablage": "Filing",
        "Status": "Status",
        "Fortschritt": "Progress",
        "Aktionen": "Actions",
        "Noch keine Flows vorhanden.": "No flows yet.",
        "Extra sicher": "Extra safe",
        "Standard": "Standard",
        "Automatik an": "Automation on",
        "Manuell": "Manual",
        "Mit Unterordnern": "With subfolders",
        "Weitermachen": "Continue",
        "Von vorn ansehen": "View from beginning",
        "Offene Bilder": "Open images",
        "Bearbeiten": "Edit",
        "Duplizieren": "Duplicate",
        "Fortsetzen": "Resume",
        "Pausieren": "Pause",
        "Ablage prüfen": "Review filing",
        "Jetzt ausführen": "Run now",
        "Ereignisse": "Events",
        "Flow verwerfen": "Delete flow",
        "Entwurf": "Draft",
        "In Arbeit": "In progress",
        "Pausiert": "Paused",
        "Bereit": "Ready",
        "Wartet auf Ablage": "Waiting for filing",
        "Wird abgelegt": "Filing",
        "Abgeschlossen": "Done",
        "Album": "Album",
        "Verschieben": "Move",
        "Kopieren": "Copy",
        "Rückgängig": "Undo",
        "Zurück": "Back",
        "Serie": "Streak",
        "Dieser Flow": "This flow",
        "Bilder/min": "Images/min",
        "Vorgeladen": "Preloaded",
        "Flow-Fortschritt": "Flow progress",
        "Schnellziele": "Quick targets",
        "Schnellziel": "Quick target",
        "Überspringen": "Skip",
        "Leertaste": "Space",
        "Vorschaubilder": "Thumbnails",
        "Alle Ziele": "All targets",
        "Album anlegen": "Create album",
        "Ordner anlegen": "Create folder",
        "Eine Ebene hoch": "Up one level",
        "Ziel suchen": "Search target",
        "Ordner suchen": "Search folders",
        "Album suchen": "Search albums",
        "Suche leeren": "Clear search",
        "Sucht im geöffneten Ordner und seinen Unterordnern.": "Searches the open folder and its subfolders.",
        "Sucht in deinen Nextcloud-Alben.": "Searches your Nextcloud albums.",
        "Neues Album": "New album",
        "Neuer Ordner": "New folder",
        "Erscheint sofort in den Zielen und kann als Schnellziel gemerkt werden.": "Appears in targets immediately and can be saved as a quick target.",
        "Wird angelegt": "Creating",
        "Anlegen": "Create",
        "Vorschauleiste": "Preview strip",
        "Vorherige Vorschaubilder": "Previous thumbnails",
        "Nächste Vorschaubilder": "Next thumbnails",
        "Vorgeladene Bilder": "Preloaded images",
        "Keine Vorschaubilder geladen.": "No thumbnails loaded.",
        "Kein Bild geladen": "No image loaded",
        "Bild": "Image",
        "Keine Ziele in diesem Ordner.": "No targets in this folder.",
        "Alle offenen Bilder sind entschieden.": "All open images are decided.",
        "Als nächstes bitte die Ablage prüfen. Dort siehst du Warnungen, Doppelungen und gibst die Entscheidungen frei.": "Next, please review filing. There you see warnings and duplicates and release the decisions.",
        "Zur Übersicht": "Go to overview",
        "Dateiänderungen aktiv": "File changes active",
        "Geschützter Testbetrieb": "Protected test mode",
        "Reale Dateiänderungen sind freigeschaltet. Ablagen können Dateien verändern.": "Real file changes are enabled. Filing can change files.",
        "Reale Dateiänderungen sind gesperrt. Du kannst Ablagen prüfen und für später merken, ohne Dateien zu verändern.": "Real file changes are locked. You can review filing and save it for later without changing files.",
        "Server ruhig": "Server quiet",
        "Automatik wartet": "Automation waiting",
        "Automatik aus": "Automation off",
        "Dateien können geändert werden": "Files can be changed",
        "Dateiänderungen gesperrt": "File changes locked",
        "Prüfsummen an": "Checksums on",
        "Diagnose exportieren": "Export diagnostics",
        "Anonymisiert exportieren": "Export anonymized",
        "Anonymisierten Supportexport laden": "Download anonymized support export",
        "Alle Logs laden": "Download all logs",
        "Anonymisierte Logs laden": "Download anonymized logs",
        "Anonymisierter Supportexport wurde erstellt.": "Anonymized support export was created.",
        "Systemprüfung": "System check",
        "Neu prüfen": "Check again",
        "Schutz": "Safety",
        "Daten": "Data",
        "Geführter Test": "Guided test",
        "Testkonto aktiv": "Test account active",
        "Nur mit albentest": "albentest only",
        "Geführter Test ist erlaubt.": "Guided test is allowed.",
        "Produktive Konten nicht für Testläufe nutzen.": "Do not use production accounts for test runs.",
        "Geführter Testlauf": "Guided test run",
        "Diese Schritte prüfen die App-Funktionen ohne echte Dateiänderungen.": "These steps verify the app without real file changes.",
        "Mit albentest anmelden": "Sign in as albentest",
        "Flow speichern und öffnen": "Save and open flow",
        "Entscheidung, Rückgängig und Ablage prüfen": "Decision, undo and filing review",
        "Ablage nur vormerken, nichts ausführen": "Save filing only, do not execute",
        "Prüfen": "Check",
        "Stopp": "Stop",
        "Offen": "Open",
        "Die App läuft, aber die Datenbankprüfung braucht Aufmerksamkeit.": "The app runs, but the database check needs attention.",
        "Die App ist im geschützten Testbetrieb und bereit für sichere Funktionsprüfungen.": "The app is in protected test mode and ready for safe functional checks.",
        "Echte Dateiänderungen sind aktiv. Nur mit bewusstem Testfenster und Backup verwenden.": "Real file changes are active. Use only in a planned test window with backup.",
        "Dateiänderungen aktiv": "File changes active",
        "Ablage wird geprüft.": "Checking filing.",
        "Entscheidungen": "Decisions",
        "Wartet auf Freigabe": "Waiting for release",
        "Warnungen": "Warnings",
        "Erledigt": "Done",
        "Blockiert": "Blocked",
        "Ablage Aktionen": "Filing actions",
        "Ablage-Protokoll": "Filing log",
        "Die letzten Diagnoseereignisse zu diesem Flow. Pfade und Prüfdaten stehen im Kontext.": "The latest diagnostic events for this flow. Paths and check data are shown in context.",
        "Noch keine Protokolleinträge für diesen Flow.": "No log entries for this flow yet.",
        "Erneut prüfen": "Check again",
        "Einstellung merken": "Remember setting",
        "Zur Ausführung freigeben": "Release for execution",
        "Für später vormerken": "Save for later",
        "Alle": "All",
        "Auffälligkeiten": "Issues",
        "Keine Aktion nötig.": "No action needed.",
        "Erst die Fehler beheben. Danach kann die Ablage freigegeben werden.": "Fix errors first. Filing can be released afterwards.",
        "Fehler beheben": "Fix errors",
        "Fehlerbehebung": "Issue repair",
        "Diese Werkzeuge ändern nur noch nicht ausgeführte Ablagepunkte. Laufende oder bereits erledigte Ablagen bleiben unverändert.": "These tools only change filing items that have not run yet. Running or completed items remain unchanged.",
        "Fehler erneut prüfen": "Check issues again",
        "Offene Bilder zeigen": "Show open images",
        "Zielordner anlegen": "Create destination folder",
        "Eintrag zurücksetzen": "Reset item",
        "Zurücksetzen & offene Bilder": "Reset and show open images",
        "Mit neuem Namen ablegen": "File with new name",
        "Alle Zielkonflikte umbenennen": "Rename all target conflicts",
        "Aus Stapel entfernen": "Remove from stack",
        "Entfernen & offene Bilder": "Remove and show open images",
        "Alle Fehler zurücksetzen": "Reset all errors",
        "Alle zurücksetzen & offene Bilder": "Reset all and show open images",
        "Kein direkt behebbarer Fehler in den sichtbaren Einträgen. Prüfe die Ablage erneut oder öffne das Protokoll.": "No directly repairable error in the visible entries. Check filing again or open the log.",
        "Fehlender Zielordner": "Missing destination folder",
        "Zielkonflikt": "Destination conflict",
        "Fehlerhafte Entscheidung": "Faulty decision",
        "Sicherer Vorschlag": "Safe suggestion",
        "Ordner anlegen oder den Eintrag zurücksetzen.": "Create the folder or reset the item.",
        "Ordner anlegen oder den Eintrag aus dem Stapel entfernen.": "Create the folder or remove the item from the stack.",
        "Wähle einen freien Zielnamen oder entferne diesen Ablagepunkt aus dem Stapel.": "Choose a free destination name or remove this filing item from the stack.",
        "ImageFlow wählt automatisch den nächsten freien Dateinamen im Zielordner.": "ImageFlow automatically chooses the next free file name in the destination folder.",
        "Eintrag zurücksetzen und das Bild danach neu sortieren.": "Reset the item and sort the image again afterwards.",
        "Aus Stapel entfernen und das Bild danach neu sortieren.": "Remove from stack and sort the image again afterwards.",
        "Im Protokoll prüfen und danach neu sortieren.": "Review the log and sort again afterwards.",
        "Noch einmal prüfen.": "Check again.",
        "Das Ziel wurde angelegt. Die Ablage wird erneut geprüft.": "The destination was created. Filing is checked again.",
        "Der fehlerhafte Eintrag wurde zurückgesetzt.": "The faulty item was reset.",
        "Die sichtbaren Fehler wurden zurückgesetzt.": "The visible errors were reset.",
        "Der Eintrag wurde aus dem Stapel entfernt.": "The item was removed from the stack.",
        "Die sichtbaren Fehler wurden aus dem Stapel entfernt.": "The visible errors were removed from the stack.",
        "Der Ablagepunkt wurde mit neuem Namen vorbereitet.": "The filing item was prepared with a new name.",
        "Die sichtbaren Zielkonflikte wurden mit neuen Namen vorbereitet.": "The visible target conflicts were prepared with new names.",
        "Noch keine Entscheidungen für die Ablage vorhanden.": "No filing decisions yet.",
        "Keine Einträge in diesem Filter.": "No entries in this filter.",
        "Geplant": "Planned",
        "In Arbeit": "In progress",
        "Unklar": "Unclear",
        "Dateiänderungen aktiv": "File changes active",
        "Automatik aktiv": "Automation active",
        "Automatik bereit": "Automation ready",
        "Wartet auf Ruhe": "Waiting for quiet server",
        "Protokoll": "Log",
        "Sicherheits- und Sortierereignisse für deine Flows.": "Safety and sorting events for your flows.",
        "Alle Level": "All levels",
        "Debug": "Debug",
        "Info": "Info",
        "Warnung": "Warning",
        "Alle Flows": "All flows",
        "Diagnoseüberblick": "Diagnostics overview",
        "Automatik vorbereitet": "Automation prepared",
        "Protokoll wird geladen.": "Loading log.",
        "Noch keine Protokolleinträge vorhanden.": "No log entries yet.",
        "Globale Betriebseinstellungen": "Global operation settings",
        "Diese Werte gelten serverweit für alle ImageFlow-Benutzer und werden in der Nextcloud-App-Konfiguration gespeichert.": "These values apply server-wide for all ImageFlow users and are stored in the Nextcloud app configuration.",
        "Speichern": "Save",
        "Betriebseinstellungen werden geladen.": "Loading operation settings.",
        "Echte Dateiänderungen erlauben": "Allow real file changes",
        "Automatisch im Hintergrund ablegen": "File automatically in background",
        "Nur bei ruhigem Server laufen lassen": "Run only when the server is quiet",
        "Maximale Serverauslastung (%)": "Maximum server usage (%)",
        "Nur im Zeitfenster laufen": "Run only in time window",
        "Start": "Start",
        "Ende": "End",
        "Automatikstatus wird nach dem Speichern neu geprüft.": "Automation status is checked again after saving.",
        "Schließen": "Close",
        "Diesen Ordner wählen": "Choose this folder",
        "Ordner werden geladen.": "Loading folders.",
        "Keine Unterordner vorhanden.": "No subfolders.",
        "Dateien": "Files",
        "Zielordner wählen": "Choose destination folder",
        "Bilderordner wählen": "Choose image folder",
        "Wählen": "Choose",
        "Unterordner": "Subfolders",
        "Schnellziel entfernen": "Remove quick target",
        "Ordner öffnen": "Open folder",
        "Als Schnellziel merken": "Save as quick target",
        "Ablage entfernen": "Remove filing item",
        "Startet nur die Ansicht beim ersten Bild. Bereits abgelegte Dateien werden nicht zurückgeholt.": "Only restarts the view at the first image. Already filed files are not restored.",
        "Startet die Ansicht beim ersten Bild. Vorgemerkte Ablagen bleiben erhalten.": "Restarts the view at the first image. Saved filing decisions remain.",
        "Öffnet die Flow-Erstellung und setzt den Fokus auf den Namen.": "Opens flow creation and focuses the name field.",
        "Öffnet den Sortierbildschirm für diesen Flow.": "Opens the sorting screen for this flow.",
        "Startet die Ansicht passend zur gewählten Startposition.": "Starts the view at the selected starting point.",
        "Zeigt nur Bilder, für die noch keine Entscheidung gespeichert ist.": "Shows only images without a saved decision.",
        "Prüft alle vorgemerkten Entscheidungen auf Warnungen, Doppelungen und Ausführbarkeit.": "Checks all saved decisions for warnings, duplicates and executability.",
        "Startet sofort die freigegebenen Ablagen. Nur aktive Dateiänderungen führen echte Kopien, Verschiebungen oder Albumänderungen aus.": "Immediately starts released filing items. Only active file changes perform real copies, moves or album updates.",
        "Nimmt die letzte Entscheidung zurück, solange sie noch nicht ausgeführt wurde.": "Undoes the last decision as long as it has not been executed.",
        "Speichert das aktuelle Bild im gewählten Ziel und springt direkt weiter.": "Saves the current image to the selected target and moves on.",
        "Überspringt dieses Bild ohne Ablageentscheidung.": "Skips this image without a filing decision.",
        "Legt das Ziel als Schnellziel in der linken Leiste ab.": "Saves this target as a quick target in the left rail.",
        "Entfernt dieses Schnellziel aus der linken Leiste.": "Removes this quick target from the left rail.",
        "Öffnet diesen Ordner in der Zielliste.": "Opens this folder in the target list.",
        "Öffnet das Feld zum Anlegen eines neuen Albums oder Ordners.": "Opens the field for creating a new album or folder.",
        "Legt das neue Ziel im aktuell geöffneten Bereich an.": "Creates the new target in the currently open area.",
        "Löscht den Suchtext und zeigt wieder alle passenden Ziele.": "Clears the search text and shows matching targets again.",
        "Lädt die aktuellen Daten erneut vom Server.": "Reloads the current data from the server.",
        "Speichert die globalen Betriebseinstellungen.": "Saves the global operation settings.",
        "Speichert Diagnoseinformationen für Support und Fehlersuche.": "Exports diagnostic information for support and troubleshooting.",
        "Erstellt einen Supportexport, in dem Benutzer, Pfade und Dateinamen anonymisiert sind.": "Creates a support export where users, paths and file names are anonymized.",
        "Erstellt als Admin einen Diagnoseexport mit globalen ImageFlow-Logs.": "Creates a diagnostics export with global ImageFlow logs as an admin.",
        "Erstellt als Admin einen anonymisierten Supportexport mit globalen ImageFlow-Logs.": "Creates an anonymized support export with global ImageFlow logs as an admin.",
        "Gibt geprüfte Entscheidungen für die spätere Ausführung frei oder merkt sie sicher vor.": "Releases checked decisions for later execution or safely saves them.",
        "Entfernt diesen noch nicht ausgeführten Ablagepunkt aus der Liste.": "Removes this not-yet-executed filing item from the list.",
        "Öffnet Werkzeuge, um blockierende Ablagefehler sicher zu bereinigen.": "Opens tools to safely repair blocking filing errors.",
        "Legt den fehlenden Zielordner an und prüft die Ablage danach erneut.": "Creates the missing destination folder and checks filing again afterwards.",
        "Setzt diesen fehlerhaften Eintrag zurück, damit das Bild wieder offen ist.": "Resets this faulty item so the image is open again.",
        "Setzt diesen fehlerhaften Eintrag zurück und zeigt danach offene Bilder.": "Resets this faulty item and then shows open images.",
        "Setzt alle sichtbaren, noch nicht ausgeführten Fehler zurück.": "Resets all visible errors that have not run yet.",
        "Setzt alle sichtbaren, noch nicht ausgeführten Fehler zurück und zeigt danach offene Bilder.": "Resets all visible errors that have not run yet and then shows open images.",
        "Entfernt diesen noch nicht ausgeführten Ablagepunkt aus dem Stapel.": "Removes this not-yet-executed filing item from the stack.",
        "Entfernt diesen Ablagepunkt und zeigt danach offene Bilder.": "Removes this filing item and then shows open images.",
        "Entfernt alle sichtbaren, noch nicht ausgeführten Fehler aus dem Stapel.": "Removes all visible not-yet-executed errors from the stack.",
        "Entfernt alle sichtbaren Fehler und zeigt danach offene Bilder.": "Removes all visible errors and then shows open images.",
        "Wählt automatisch den nächsten freien Dateinamen im Zielordner.": "Automatically chooses the next free file name in the destination folder.",
        "Wählt für alle sichtbaren Zielkonflikte automatisch freie Dateinamen.": "Automatically chooses free file names for all visible target conflicts.",
        "Schließt die Prüfung und zeigt die offenen Bilder dieses Flows.": "Closes review and shows the open images for this flow.",
        "Wählt diesen Ordner für den Flow aus.": "Chooses this folder for the flow.",
        "Öffnet den Ordnerauswahldialog.": "Opens the folder picker.",
        "Bestimmt den Anzeigenamen des Flows.": "Sets the display name of the flow.",
        "Quelle der zu sortierenden Bilder.": "Source of the images to sort.",
        "Nimmt Bilder aus Unterordnern in denselben Flow auf.": "Includes images from subfolders in the same flow.",
        "Legt fest, ob Entscheidungen Alben füllen, Bilder verschieben oder kopieren.": "Defines whether decisions fill albums, move images or copy images.",
        "Zielbasis für Kopieren oder Verschieben.": "Destination base for copy or move.",
        "Aktiviert zusätzliche Prüfsummenprüfungen vor und nach Dateioperationen.": "Enables extra checksum checks before and after file operations.",
        "Erlaubt die automatische Verarbeitung, sobald der Administrator dies freigibt und der Server ruhig ist.": "Allows automatic processing once an administrator enables it and the server is quiet.",
        "Steuert, wie viele Vorschaubilder vorbereitet werden.": "Controls how many thumbnails are prepared.",
        "Sortiert Zielvorschläge nach Relevanz oder alphabetisch.": "Sorts target suggestions by relevance or alphabetically.",
        "Wählt die Tasten für die schnellen Ziele links.": "Chooses the keys for quick targets on the left.",
        "Globaler Schalter für echte Kopier-, Verschiebe- und Albumoperationen.": "Global switch for real copy, move and album operations.",
        "Erlaubt dem Hintergrundjob freigegebene Ablagen abzuarbeiten.": "Allows the background job to process released filing items.",
        "Stoppt Automatikläufe bei zu hoher Serverlast.": "Stops automatic runs when server load is too high.",
        "Grenze für die normalisierte Serverauslastung. 100% entspricht der vollen Kapazität aller CPU-Kerne.": "Limit for normalized server usage. 100% means the full capacity of all CPU cores.",
        "Automatik darf laufen: Serverauslastung": "Automation may run: server usage",
        "Beschränkt Automatikläufe auf ein Zeitfenster.": "Restricts automatic runs to a time window.",
        "Beginn des erlaubten Zeitfensters.": "Start of the allowed time window.",
        "Ende des erlaubten Zeitfensters.": "End of the allowed time window."
      },
      patterns: [
        [/^(\d+) entschieden$/, "$1 decided"],
        [/^(\d+) wartet$/, "$1 waiting"],
        [/^(\d+) ausführbar$/, "$1 ready to run"],
        [/^(\d+) Flows$/, "$1 flows"],
        [/^(\d+) Ablagepunkte, (\d+) auffällig$/, "$1 filing items, $2 issues"],
        [/^Bild (\d+)\/(\d+)$/, "Image $1/$2"],
        [/^Position (\d+)$/, "Position $1"],
        [/^(\d+)er Serie$/, "$1 streak"],
        [/^Kein Ziel passt zu "(.+)".$/, "No target matches \"$1\"."],
        [/^Wird in (.+) angelegt.$/, "Will be created in $1."],
        [/^(\d+) geprüft, (\d+) angezeigt.$/, "$1 checked, $2 shown."],
        [/^(\d+) geprüft, (\d+) wichtige Einträge angezeigt. Die Summen und Fehlerprüfung gelten für die komplette Ablage.$/, "$1 checked, $2 important entries shown. Totals and issue checks apply to the complete filing list."],
        [/^(\d+) sichtbar$/, "$1 visible"],
        [/^(\d+) sichtbar von (\d+)$/, "$1 visible of $2"],
        [/^Nächster Schritt: (\d+) Entscheidungen zur Ausführung freigeben. Danach kannst du manuell starten oder die Automatik arbeiten lassen.$/, "Next step: release $1 decisions for execution. Then you can start manually or let automation run."],
        [/^Nächster Schritt: (\d+) Entscheidungen sicher für später vormerken. Dateien werden dabei nicht verändert.$/, "Next step: safely save $1 decisions for later. Files are not changed."],
        [/^(\d+) Ablagen sind ausführbar. Du kannst jetzt manuell starten oder die Automatik laufen lassen.$/, "$1 filing items are ready. You can start manually now or let automation run."],
        [/^(\d+) Ablagen warten. Echte Dateiänderungen sind noch serverseitig gesperrt.$/, "$1 filing items are waiting. Real file changes are still locked server-side."],
        [/^Automatik wartet: Serverauslastung ([0-9.,]+)% liegt über ([0-9.,]+)%. Linux-Load ([0-9.,]+) bei (\d+) CPU-Kernen.$/, "Automation waiting: server usage $1% is above $2%. Linux load $3 on $4 CPU cores."],
        [/^Automatik darf laufen: Serverauslastung ([0-9.,]+)% liegt unter ([0-9.,]+)%. Der nächste Nextcloud-Cronlauf verarbeitet freigegebene Ablagen.$/, "Automation may run: server usage $1% is below $2%. The next Nextcloud cron run processes released filing items."],
        [/^Auslastung ([0-9.,-]+)% \/ Grenze ([0-9.,-]+)% · Load ([0-9.,-]+) · CPU-Kerne (\d+)$/, "Usage $1% / limit $2% · load $3 · CPU cores $4"],
        [/^Schnellziel entfernen: (.+)$/, "Remove quick target: $1"],
        [/^Ordner öffnen: (.+)$/, "Open folder: $1"],
        [/^Als Schnellziel merken: (.+)$/, "Save as quick target: $1"],
        [/^Ablage entfernen: (.+)$/, "Remove filing item: $1"],
        [/^Neuer Zielname: (.+)$/, "New destination name: $1"],
        [/^Taste für Schnellziel (\d+)$/, "Key for quick target $1"],
        [/^Nur (.+)$/, "Only $1"],
        [/^Version (.+)$/, "Version $1"]
      ]
    }
  };

  const ACTION_HELP_DE = {
    "focus-new-flow": "Öffnet die Flow-Erstellung und setzt den Fokus auf den Namen.",
    "open-sort": "Öffnet den Sortierbildschirm für diesen Flow.",
    "start-sort": "Startet die Ansicht passend zur gewählten Startposition.",
    "go-sort": "Öffnet den Sortierbildschirm für diesen Flow.",
    "go-jobs": "Zeigt die Übersicht mit allen Flows.",
    "show-log": "Zeigt Diagnose- und Sortierereignisse.",
    "show-job-log": "Zeigt Diagnoseereignisse nur für diesen Flow.",
    "queue-job": "Prüft alle vorgemerkten Entscheidungen auf Warnungen, Doppelungen und Ausführbarkeit.",
    "confirm-queue-job": "Gibt geprüfte Entscheidungen für die spätere Ausführung frei oder merkt sie sicher vor.",
    "process-job-now": "Startet sofort die freigegebenen Ablagen. Nur aktive Dateiänderungen führen echte Kopien, Verschiebungen oder Albumänderungen aus.",
    "process-job-now-direct": "Startet sofort die freigegebenen Ablagen. Nur aktive Dateiänderungen führen echte Kopien, Verschiebungen oder Albumänderungen aus.",
    "undo-last-decision": "Nimmt die letzte Entscheidung zurück, solange sie noch nicht ausgeführt wurde.",
    "assign": "Speichert das aktuelle Bild im gewählten Ziel und springt direkt weiter.",
    "skip-current": "Überspringt dieses Bild ohne Ablageentscheidung.",
    "add-favorite": "Legt das Ziel als Schnellziel in der linken Leiste ab.",
    "remove-favorite": "Entfernt dieses Schnellziel aus der linken Leiste.",
    "browse-target-folder": "Öffnet diesen Ordner in der Zielliste.",
    "browse-target-parent": "Öffnet den übergeordneten Zielordner.",
    "focus-target-create": "Öffnet das Feld zum Anlegen eines neuen Albums oder Ordners.",
    "create-target": "Legt das neue Ziel im aktuell geöffneten Bereich an.",
    "clear-target-search": "Löscht den Suchtext und zeigt wieder alle passenden Ziele.",
    "refresh": "Lädt die aktuellen Daten erneut vom Server.",
    "refresh-worklist-preview": "Prüft die Ablage erneut mit aktuellen Serverdaten.",
    "refresh-settings": "Lädt die Betriebseinstellungen erneut vom Server.",
    "refresh-logs": "Lädt die Diagnoseereignisse erneut.",
    "export-diagnostics": "Speichert Diagnoseinformationen für Support und Fehlersuche.",
    "export-diagnostics-anonymized": "Erstellt einen Supportexport, in dem Benutzer, Pfade und Dateinamen anonymisiert sind.",
    "export-diagnostics-all": "Erstellt als Admin einen Diagnoseexport mit globalen ImageFlow-Logs.",
    "export-diagnostics-all-anonymized": "Erstellt als Admin einen anonymisierten Supportexport mit globalen ImageFlow-Logs.",
    "edit-job": "Öffnet diesen Flow zum Bearbeiten.",
    "duplicate-job": "Erstellt eine Kopie dieses Flows ohne Entscheidungen.",
    "pause-job": "Pausiert diesen Flow, bis du ihn fortsetzt.",
    "resume-job": "Setzt einen pausierten Flow fort.",
    "discard-job": "Löscht diesen Flow nach Bestätigung.",
    "clear-job-draft": "Setzt das Formular auf Standardwerte zurück.",
    "cancel-edit-job": "Beendet die Bearbeitung ohne weitere Änderung.",
    "open-folder-picker": "Öffnet den Ordnerauswahldialog.",
    "close-folder-picker": "Schließt die Ordnerauswahl.",
    "folder-picker-parent": "Öffnet den übergeordneten Ordner.",
    "folder-picker-open": "Öffnet diesen Ordner.",
    "choose-folder": "Wählt diesen Ordner für den Flow aus.",
    "close-worklist-preview": "Schließt die Ablageprüfung.",
    "filter-worklist": "Filtert die Ablagepunkte nach diesem Zustand.",
    "remove-worklist-item": "Entfernt diesen noch nicht ausgeführten Ablagepunkt aus der Liste.",
    "toggle-worklist-repair": "Öffnet Werkzeuge, um blockierende Ablagefehler sicher zu bereinigen.",
    "repair-create-target-folder": "Legt den fehlenden Zielordner an und prüft die Ablage danach erneut.",
    "repair-reset-item": "Entfernt diesen noch nicht ausgeführten Ablagepunkt aus dem Stapel.",
    "repair-reset-item-and-sort": "Entfernt diesen Ablagepunkt und zeigt danach offene Bilder.",
    "repair-reset-visible-errors": "Entfernt alle sichtbaren, noch nicht ausgeführten Fehler aus dem Stapel.",
    "repair-reset-visible-errors-and-sort": "Entfernt alle sichtbaren Fehler und zeigt danach offene Bilder.",
    "repair-auto-rename-item": "Wählt automatisch den nächsten freien Dateinamen im Zielordner.",
    "repair-auto-rename-visible-conflicts": "Wählt für alle sichtbaren Zielkonflikte automatisch freie Dateinamen.",
    "repair-go-sort": "Schließt die Prüfung und zeigt die offenen Bilder dieses Flows.",
    "toggle-worklist-auto": "Merkt, ob dieser Flow automatisch abgelegt werden soll.",
    "select-image": "Springt zu diesem Vorschaubild.",
    "page-prev": "Zeigt die vorherigen Vorschaubilder.",
    "page-next": "Zeigt die nächsten Vorschaubilder."
  };

  const CONTROL_HELP_DE = {
    "Name": "Bestimmt den Anzeigenamen des Flows.",
    "Bilderordner": "Quelle der zu sortierenden Bilder.",
    "Unterordner mit einbeziehen": "Nimmt Bilder aus Unterordnern in denselben Flow auf.",
    "Wie sollen sortierte Bilder abgelegt werden?": "Legt fest, ob Entscheidungen Alben füllen, Bilder verschieben oder kopieren.",
    "Zielordner": "Zielbasis für Kopieren oder Verschieben.",
    "Mit Prüfsummen extra sicher prüfen": "Aktiviert zusätzliche Prüfsummenprüfungen vor und nach Dateioperationen.",
    "Automatisch ablegen, wenn der Server ruhig ist": "Erlaubt die automatische Verarbeitung, sobald der Administrator dies freigibt und der Server ruhig ist.",
    "Vorschau laden": "Steuert, wie viele Vorschaubilder vorbereitet werden.",
    "Ziel-Reihenfolge": "Sortiert Zielvorschläge nach Relevanz oder alphabetisch.",
    "Tastenbelegung": "Wählt die Tasten für die schnellen Ziele links.",
    "Eigene Schnellziel-Tasten": "Legt eigene Tasten für die ersten neun Schnellziele fest.",
    "Ziel suchen": "Filtert die Ziele, ohne den aktuellen Flow zu verlassen.",
    "Album anlegen": "Erstellt ein neues Album und zeigt es direkt in den Zielen.",
    "Ordner anlegen": "Erstellt einen neuen Zielordner und zeigt ihn direkt in den Zielen.",
    "Echte Dateiänderungen erlauben": "Globaler Schalter für echte Kopier-, Verschiebe- und Albumoperationen.",
    "Automatisch im Hintergrund ablegen": "Erlaubt dem Hintergrundjob freigegebene Ablagen abzuarbeiten.",
    "Nur bei ruhigem Server laufen lassen": "Stoppt Automatikläufe bei zu hoher Serverlast.",
        "Maximale Serverauslastung (%)": "Grenze für die normalisierte Serverauslastung. 100% entspricht der vollen Kapazität aller CPU-Kerne.",
    "Nur im Zeitfenster laufen": "Beschränkt Automatikläufe auf ein Zeitfenster.",
    "Start": "Beginn des erlaubten Zeitfensters.",
    "Ende": "Ende des erlaubten Zeitfensters."
  };

  function numberOrNull(value) {
    const parsed = Number.parseInt(value || "", 10);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function normalizeCustomHotkeys(value) {
    const items = Array.isArray(value) ? value : [];
    const seen = new Set();
    return Array.from({ length: 9 }, (_, index) => {
      const raw = items[index] === undefined || items[index] === null ? "" : String(items[index]).trim().toLowerCase();
      const key = Array.from(raw)[0] || "";
      if (!key || key === "0" || key === " " || seen.has(key)) {
        return "";
      }
      seen.add(key);
      return key;
    });
  }

  function hotkeyForPosition(position, options = {}) {
    const normalizedPosition = Math.max(1, Math.min(9, Number(position) || 1));
    const index = normalizedPosition - 1;
    if (options.hotkeys === "custom") {
      return normalizeCustomHotkeys(options.customHotkeys || [])[index] || "";
    }
    if (options.hotkeys === "letters") {
      return String.fromCharCode("a".charCodeAt(0) + index);
    }
    return String(normalizedPosition);
  }

  function hotkeySummaryLabel(options = {}) {
    if (options.hotkeys === "custom") {
      const keys = normalizeCustomHotkeys(options.customHotkeys || []).filter(Boolean);
      return keys.length ? keys.join(" ") : "Eigene";
    }
    return options.hotkeys === "letters" ? "A-I" : "1-9";
  }

  function applyConfiguredHotkeys(favorites, options = state.sortState?.job?.options || {}) {
    return favorites.map((favorite, index) => {
      const isSkip = favorite.locked || favorite.targetType === "skip" || favorite.id === "skip";
      if (isSkip) {
        return { ...favorite, hotkey: "0" };
      }
      const position = Number(favorite.position || index + 1);
      return {
        ...favorite,
        position,
        hotkey: hotkeyForPosition(position, options),
      };
    });
  }

  function normalizeDisplayPath(path) {
    const parts = String(path || "/")
      .replace(/\\/g, "/")
      .split("/")
      .map((part) => part.trim())
      .filter((part) => part && part !== ".");
    return parts.length ? `/${parts.filter((part) => part !== "..").join("/")}` : "/";
  }

  function normalizeSearchTerm(value) {
    return String(value || "")
      .trim()
      .toLocaleLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function parentPath(path) {
    const parts = normalizeDisplayPath(path).split("/").filter(Boolean);
    if (parts.length === 0) {
      return null;
    }
    parts.pop();
    return parts.length ? `/${parts.join("/")}` : "/";
  }

  function pathBaseName(path) {
    const parts = normalizeDisplayPath(path).split("/").filter(Boolean);
    return parts.at(-1) || "";
  }

  function apiUrl(path) {
    return hasNextcloud ? window.OC.generateUrl(`/apps/imageflow${path}`) : path;
  }

  async function request(path, options = {}) {
    if (!hasNextcloud) {
      return mockRequest(path, options);
    }

    const response = await fetch(apiUrl(path), {
      method: options.method || "GET",
      headers: {
        "Content-Type": "application/json",
        requesttoken: window.OC.requestToken || "",
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      credentials: "same-origin",
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.message || payload.error || `HTTP ${response.status}`);
    }

    return payload;
  }

  async function mockRequest(path, options) {
    await new Promise((resolve) => setTimeout(resolve, 20));
    if (path === "/api/v1/health") {
      return mockHealth();
    }
    if (path === "/api/v1/admin/settings" && (!options.method || options.method === "GET")) {
      return mockAdminSettings();
    }
    if (path === "/api/v1/admin/settings" && options.method === "PUT") {
      const current = mockAdminSettings();
      const settings = {
        ...current.settings,
        ...options.body,
        backgroundMaxLoadPercent: Number(options.body.backgroundMaxLoadPercent || current.settings.backgroundMaxLoadPercent),
      };
      settings.backgroundMaxLoad1m = Number(((settings.backgroundMaxLoadPercent / 100) * 4).toFixed(2));
      root.dataset.mockRealExecution = settings.realExecutionEnabled ? "1" : "0";
      root.dataset.mockBackgroundMode = settings.backgroundProcessingEnabled ? "cron-enabled" : "manual-only";
      return { isAdmin: true, settings, backgroundGate: mockBackgroundGate(settings.backgroundProcessingEnabled) };
    }
    if (path.startsWith("/api/v1/support/export")) {
      return {
        app: "imageflow",
        version: "1.0.0",
        generatedAt: Math.floor(Date.now() / 1000),
        anonymized: path.includes("anonymized=1"),
        userId: root.dataset.mockUser || "albentest",
        server: { phpVersion: "8.3", phpSapi: "fpm-fcgi", osFamily: "Linux" },
        settings: mockAdminSettings().settings,
        backgroundGate: mockBackgroundGate(false),
        counts: mockDiagnostics(false, false, "manual-only"),
        logs: mockLogs(),
      };
    }
    if (path === "/api/v1/jobs" && (!options.method || options.method === "GET")) {
      return { jobs: state.jobs.length ? state.jobs : mockJobs() };
    }
    if (path === "/api/v1/jobs" && options.method === "POST") {
      const job = {
        id: Date.now(),
        name: options.body.name || "Neuer Flow",
        sourcePath: options.body.sourcePath || "/Photos",
        targetMode: options.body.targetMode || "album",
        targetPath: options.body.targetPath || null,
        albumName: options.body.albumName || null,
        status: "draft",
        safeMode: options.body.safeMode !== false,
        totalFiles: 0,
        sortedFiles: 0,
        skippedFiles: 0,
        queuedOperations: 0,
        executedOperations: 0,
        failedOperations: 0,
        lastRunStatus: {
          level: "info",
          event: "job_execution_queued",
          message: "Ablage wurde vorgemerkt.",
          createdAt: Math.floor(Date.now() / 1000) - 80,
        },
        options: {
          autoProcess: Boolean(options.body.autoProcess),
          recursiveSource: Boolean(options.body.recursiveSource),
          preloadMode: options.body.preloadMode || "balanced",
          targetOrdering: options.body.targetOrdering || "relevance",
          hotkeys: options.body.hotkeys || "number-row",
          customHotkeys: normalizeCustomHotkeys(options.body.customHotkeys || []),
        },
        updatedAt: Math.floor(Date.now() / 1000),
      };
      state.jobs = [job, ...state.jobs];
      return { job };
    }
    if (/\/api\/v1\/jobs\/\d+$/.test(path) && options.method === "PUT") {
      const jobId = Number.parseInt(path.split("/").at(-1), 10);
      const current = state.jobs.find((job) => job.id === jobId) || mockJobs().find((job) => job.id === jobId) || mockJobs()[0];
      const updated = {
        ...current,
        name: options.body.name || current.name,
        sourcePath: options.body.sourcePath || current.sourcePath,
        targetMode: options.body.targetMode || current.targetMode,
        targetPath: options.body.targetMode === "album" ? null : (options.body.targetPath || current.targetPath || "/"),
        safeMode: options.body.safeMode !== false,
        options: {
          ...(current.options || {}),
          autoProcess: Boolean(options.body.autoProcess),
          recursiveSource: Boolean(options.body.recursiveSource),
          preloadMode: options.body.preloadMode || current.options?.preloadMode || "balanced",
          targetOrdering: options.body.targetOrdering || current.options?.targetOrdering || "relevance",
          hotkeys: options.body.hotkeys || current.options?.hotkeys || "number-row",
          customHotkeys: normalizeCustomHotkeys(options.body.customHotkeys || current.options?.customHotkeys || []),
        },
        updatedAt: Math.floor(Date.now() / 1000),
      };
      state.jobs = state.jobs.map((job) => (job.id === jobId ? updated : job));
      return { job: updated };
    }
    if (/\/api\/v1\/jobs\/\d+\/duplicate$/.test(path) && options.method === "POST") {
      const jobId = Number.parseInt(path.split("/").at(-2), 10);
      const current = state.jobs.find((job) => job.id === jobId) || mockJobs().find((job) => job.id === jobId) || mockJobs()[0];
      const copy = {
        ...current,
        id: Date.now(),
        name: `${current.name} Duplikat`,
        status: "draft",
        sortedFiles: 0,
        skippedFiles: 0,
        queuedOperations: 0,
        executedOperations: 0,
        failedOperations: 0,
        updatedAt: Math.floor(Date.now() / 1000),
      };
      state.jobs = [copy, ...state.jobs];
      return { job: copy };
    }
    if (/\/api\/v1\/jobs\/\d+\/discard$/.test(path) && options.method === "POST") {
      const jobId = Number.parseInt(path.split("/").at(-2), 10);
      state.jobs = state.jobs.filter((job) => job.id !== jobId);
      return { deleted: true, jobId };
    }
    if (/\/api\/v1\/jobs\/\d+\/(pause|resume)$/.test(path) && options.method === "POST") {
      const parts = path.split("/");
      const jobId = Number.parseInt(parts.at(-2), 10);
      const operation = parts.at(-1);
      const current = state.jobs.find((job) => job.id === jobId) || mockJobs().find((job) => job.id === jobId) || mockJobs()[0];
      const updated = {
        ...current,
        status: operation === "pause" ? "paused" : "sorting",
        updatedAt: Math.floor(Date.now() / 1000),
      };
      state.jobs = [updated, ...state.jobs.filter((job) => job.id !== jobId)];
      return { job: updated };
    }
    if (/\/api\/v1\/jobs\/\d+\/worklist-preview/.test(path)) {
      const jobId = Number.parseInt(path.split("/").at(4), 10) || state.jobId || 1;
      const job = state.jobs.find((item) => item.id === jobId) || mockJobs()[0];
      return mockWorklistPreview(job);
    }
    if (/\/api\/v1\/jobs\/\d+\/queue-execution$/.test(path) && options.method === "POST") {
      const jobId = Number.parseInt(path.split("/").at(-2), 10);
      const job = state.jobs.find((item) => item.id === jobId) || mockJobs()[0];
      const queued = {
        ...job,
        status: "queued",
        queuedOperations: Math.max(1, Number(job.queuedOperations || 0)),
        options: {
          ...(job.options || {}),
          autoProcess: Boolean(options.body?.autoProcess),
        },
      };
      state.jobs = state.jobs.map((item) => (item.id === jobId ? queued : item));
      return { job: queued, preview: mockWorklistPreview(queued) };
    }
    if (/\/api\/v1\/jobs\/\d+\/process-now$/.test(path) && options.method === "POST") {
      const jobId = Number.parseInt(path.split("/").at(-2), 10);
      const job = state.jobs.find((item) => item.id === jobId) || mockJobs()[0];
      const processed = { ...job, status: "done", executedOperations: Number(job.queuedOperations || 0), queuedOperations: 0 };
      state.jobs = state.jobs.map((item) => (item.id === jobId ? processed : item));
      return {
        result: { processed: processed.executedOperations, realExecutionEnabled: true, message: "Die vorgemerkte Ablage wurde abgelegt." },
        job: processed,
        preview: mockWorklistPreview(processed),
      };
    }
    if (path.includes("/sort-state")) {
      const jobId = Number.parseInt(path.split("/").at(4), 10) || state.jobId || 1;
      const query = new URLSearchParams(path.split("?")[1] || "");
      return mockSortState(jobId, {
        cursor: query.has("cursor") ? Number.parseInt(query.get("cursor") || "0", 10) : null,
        limit: query.has("limit") ? Number.parseInt(query.get("limit") || String(PAGE_LIMIT), 10) : PAGE_LIMIT,
        start: query.get("start"),
      });
    }
    if (path.includes("/position")) {
      return {
        savedPosition: {
          cursor: options.body.cursor || 0,
          index: options.body.index || 0,
          fileId: options.body.fileId || null,
          savedAt: Math.floor(Date.now() / 1000),
        },
      };
    }
    if (path.includes("/assign")) {
      await mockDecisionDelay();
      return {
        assignment: {
          id: Date.now(),
          sourcePath: options.body.sourcePath,
          targetLabel: options.body.target.label,
          hotkey: options.body.hotkey || "",
        },
      };
    }
    if (path.includes("/skip")) {
      await mockDecisionDelay();
      return { assignment: { id: Date.now(), sourcePath: options.body.sourcePath, targetLabel: "Übersprungen" } };
    }
    if (/\/api\/v1\/jobs\/\d+\/undo$/.test(path) && options.method === "POST") {
      const jobId = Number.parseInt(path.split("/").at(-2), 10);
      const job = state.jobs.find((item) => item.id === jobId) || mockJobs()[0];
      return { message: "Letzte Entscheidung wurde zurückgenommen.", job };
    }
    if (/\/api\/v1\/jobs\/\d+\/queue\/\d+\/auto-rename$/.test(path) && options.method === "POST") {
      const jobId = Number.parseInt(path.split("/").at(-4), 10);
      const queueItemId = Number.parseInt(path.split("/").at(-2), 10);
      const job = state.jobs.find((item) => item.id === jobId) || mockJobs()[0];
      root.dataset.mockWorklistConflictRenamed = "1";
      return {
        queueItem: {
          id: queueItemId,
          jobId,
          operationType: "move",
          sourcePath: `${job.sourcePath || "/Photos"}/IMG_4022.jpg`,
          targetPath: "/Photos/S/BrasilienFotos",
          targetFileName: "IMG_4022 (1).jpg",
          status: "queued",
          readiness: "ready",
          messages: ["Zielname: IMG_4022 (1).jpg"],
        },
        targetFileName: "IMG_4022 (1).jpg",
        message: "Neuer Zielname: IMG_4022 (1).jpg",
        job,
      };
    }
    if (/\/api\/v1\/jobs\/\d+\/queue\/\d+$/.test(path) && options.method === "DELETE") {
      const jobId = Number.parseInt(path.split("/").at(-3), 10);
      const queueItemId = Number.parseInt(path.split("/").at(-1), 10);
      const job = state.jobs.find((item) => item.id === jobId) || mockJobs()[0];
      if (root.dataset.mockWorklistErrors === "1") {
        root.dataset.mockWorklistErrorReset = "1";
      }
      if (root.dataset.mockWorklistTargetConflict === "1") {
        root.dataset.mockWorklistConflictReset = "1";
      }
      return { removed: { queueItemId }, job };
    }
    if (path === "/api/v1/favorites" && options.method === "POST") {
      const favorites = mockRealFavorites();
      const duplicate = favorites.find((favorite) => favorite.targetId === options.body.targetId || (favorite.path && favorite.path === options.body.targetPath));
      if (duplicate) {
        return { favorite: duplicate, favorites: mockFavoritesWithSkip(favorites), duplicate: true };
      }
      const favorite = {
        id: Date.now(),
        label: options.body.targetLabel || options.body.label || "Favorit",
        path: options.body.targetPath || options.body.path || null,
        targetId: options.body.targetId || options.body.id || null,
        hotkey: String(Math.min(9, favorites.length + 1)),
        position: favorites.length + 1,
        locked: false,
      };
      state.mockFavorites = [...favorites, favorite].slice(0, 9).map((item, index) => ({
        ...item,
        position: index + 1,
        hotkey: String(index + 1),
      }));
      return { favorite, favorites: mockFavoritesWithSkip(state.mockFavorites), duplicate: false };
    }
    if (path === "/api/v1/favorites/reorder" && options.method === "POST") {
      const ids = Array.isArray(options.body.favoriteIds) ? options.body.favoriteIds.map(String) : [];
      const favorites = mockRealFavorites();
      const byId = new Map(favorites.map((favorite) => [String(favorite.id), favorite]));
      const ordered = [];
      ids.forEach((id) => {
        if (byId.has(id)) {
          ordered.push(byId.get(id));
          byId.delete(id);
        }
      });
      favorites.forEach((favorite) => {
        if (byId.has(String(favorite.id))) {
          ordered.push(favorite);
        }
      });
      state.mockFavorites = ordered.map((item, index) => ({ ...item, position: index + 1, hotkey: String(index + 1) }));
      return { favorites: mockFavoritesWithSkip(state.mockFavorites) };
    }
    if (/\/api\/v1\/favorites\/\d+$/.test(path) && options.method === "DELETE") {
      const favoriteId = path.split("/").at(-1);
      state.mockFavorites = mockRealFavorites()
        .filter((favorite) => String(favorite.id) !== String(favoriteId))
        .map((item, index) => ({ ...item, position: index + 1, hotkey: String(index + 1) }));
      return { deleted: true, favoriteId, favorites: mockFavoritesWithSkip(state.mockFavorites) };
    }
    if (path.includes("/folders")) {
      const query = new URLSearchParams(path.split("?")[1] || "");
      return mockFolderPage(query.get("path") || "/");
    }
    if (path === "/api/v1/targets" && options.method === "POST") {
      const mode = options.body.mode || "album";
      const name = String(options.body.name || "Neues Ziel").trim() || "Neues Ziel";
      if (mode === "album") {
        const target = { id: `album-${Date.now()}`, label: name, location: "ImageFlow" };
        state.mockTargets = [target, ...mockTargets()];
        return { mode, target, targets: state.mockTargets, duplicate: false };
      }
      const parent = normalizeDisplayPath(options.body.path || "/");
      const folder = { name, path: normalizeDisplayPath(`${parent}/${name}`), hasChildren: false };
      const folders = state.mockFolders || {};
      const currentFolders = folders[parent] || mockFolderPage(parent).folders || [];
      const duplicate = currentFolders.find((item) => normalizeDisplayPath(item.path || "") === folder.path);
      folders[parent] = duplicate ? currentFolders : [...currentFolders, folder];
      folders[folder.path] = [];
      state.mockFolders = folders;
      if (root.dataset.mockWorklistErrors === "1") {
        root.dataset.mockRepairTargetCreated = "1";
      }
      return {
        mode,
        target: {
          id: duplicate?.path || folder.path,
          label: duplicate?.name || folder.name,
          path: duplicate?.path || folder.path,
          hasChildren: Boolean(duplicate?.hasChildren),
        },
        folders: mockFolderPage(parent),
        duplicate: Boolean(duplicate),
      };
    }
    if (path.includes("/targets")) {
      const query = new URLSearchParams(path.split("?")[1] || "");
      const mode = query.get("mode") || "album";
      const search = query.get("query") || "";
      if (mode !== "album") {
        return { mode, ordering: search ? "search" : "alphabetical", folders: mockFolderPage(query.get("path") || "/", search) };
      }
      return { mode, ordering: search ? "search" : "relevance", targets: filterMockTargets(mockTargets(), search) };
    }
    if (path.includes("/logs")) {
      return { diagnostics: mockDiagnostics(false, false, "manual-only"), logs: mockLogs() };
    }
    return {};
  }

  function mockJobs() {
    return [
      {
        id: 1,
        name: "Familienfotos 2025",
        sourcePath: "/Photos/Inbox",
        targetMode: "album",
        targetPath: null,
        albumName: null,
        status: "sorting",
        safeMode: true,
        totalFiles: 320,
        sortedFiles: 74,
        skippedFiles: 6,
        queuedOperations: 74,
        executedOperations: 0,
        failedOperations: 0,
        lastRunStatus: {
          level: "debug",
          event: "queue_background_gate_waiting",
          message: "Automatik wartet auf den nächsten ruhigen Cronlauf.",
          createdAt: Math.floor(Date.now() / 1000) - 180,
        },
        options: {
          autoProcess: false,
          recursiveSource: false,
          preloadMode: "turbo",
          targetOrdering: "relevance",
          hotkeys: "number-row",
          customHotkeys: [],
        },
        updatedAt: Math.floor(Date.now() / 1000) - 240,
      },
      {
        id: 2,
        name: "Import Kamera",
        sourcePath: "/Camera/Unsortiert",
        targetMode: "copy",
        targetPath: "/Photos/Sortiert",
        albumName: null,
        status: "ready",
        safeMode: true,
        totalFiles: 118,
        sortedFiles: 118,
        skippedFiles: 3,
        queuedOperations: 118,
        executedOperations: 0,
        failedOperations: 0,
        options: {
          autoProcess: true,
          recursiveSource: true,
          preloadMode: "balanced",
          targetOrdering: "alphabetical",
          hotkeys: "number-row",
          customHotkeys: [],
        },
        updatedAt: Math.floor(Date.now() / 1000) - 900,
      },
    ];
  }

  function mockHealth() {
    const realExecutionEnabled = root.dataset.mockRealExecution === "1";
    const backgroundMode = root.dataset.mockBackgroundMode || "manual-only";
    const backgroundProcessingEnabled = backgroundMode !== "manual-only";
    const diagnostics = mockDiagnostics(realExecutionEnabled, backgroundProcessingEnabled, backgroundMode);
    return {
      app: "imageflow",
      version: "1.0.0",
      status: diagnostics.status,
      processingMode: realExecutionEnabled
        ? (backgroundProcessingEnabled ? "manual-and-background" : "manual-only")
        : "locked",
      destructiveWritesEnabled: realExecutionEnabled,
      realExecutionEnabled,
      backgroundProcessingEnabled,
      backgroundGate: mockBackgroundGate(backgroundMode === "cron-ready" || backgroundMode === "cron-enabled"),
      safeModeDefault: true,
      diagnostics,
    };
  }

  function mockDiagnostics(realExecutionEnabled, backgroundProcessingEnabled, backgroundMode) {
    const jobs = state.jobs.length ? state.jobs : mockJobs();
    const queue = {
      total: jobs.reduce((count, job) => count + Number(job.queuedOperations || 0), 0),
      planned: jobs.reduce((count, job) => count + (job.status === "queued" ? 0 : Number(job.queuedOperations || 0)), 0),
      queued: jobs.reduce((count, job) => count + (job.status === "queued" ? Number(job.queuedOperations || 0) : 0), 0),
      executed: jobs.reduce((count, job) => count + Number(job.executedOperations || 0), 0),
      issues: jobs.reduce((count, job) => count + Number(job.failedOperations || 0), 0),
    };
    const testUserAllowed = root.dataset.mockUser === "albentest";
    const gate = mockBackgroundGate(backgroundMode === "cron-ready" || backgroundMode === "cron-enabled");
    const checks = [
      {
        id: "file-writes",
        level: realExecutionEnabled ? "warning" : "ok",
        label: realExecutionEnabled ? "Dateiänderungen aktiv" : "Dateiänderungen gesperrt",
        message: realExecutionEnabled ? "Echte Dateiänderungen sind freigeschaltet." : "Sicherer Testbetrieb: Dateien bleiben unverändert.",
      },
      {
        id: "background",
        level: backgroundProcessingEnabled && !gate.canRun ? "warning" : "ok",
        label: backgroundProcessingEnabled ? "Automatik konfiguriert" : "Automatik aus",
        message: backgroundProcessingEnabled ? gate.message : "Cron verarbeitet keine ImageFlow Ablagen.",
      },
      {
        id: "database",
        level: "ok",
        label: "Datenbank erreichbar",
        message: "ImageFlow Tabellen sind erreichbar.",
      },
      {
        id: "self-test-user",
        level: testUserAllowed ? "ok" : "warning",
        label: testUserAllowed ? "Testkonto aktiv" : "Kein Testkonto",
        message: testUserAllowed ? "Der geführte Test darf mit diesem Konto durchgeführt werden." : "Geführte Tests laufen mit albentest.",
      },
    ];
    return {
      status: realExecutionEnabled ? "execution-enabled" : "safe-testing",
      userId: testUserAllowed ? "albentest" : "mock-user",
      isAdmin: root.dataset.mockAdmin !== "0",
      testUserAllowed,
      databaseOk: true,
      jobCount: jobs.length,
      queue,
      checks,
    };
  }

  function mockAdminSettings() {
    const realExecutionEnabled = root.dataset.mockRealExecution === "1";
    const backgroundProcessingEnabled = (root.dataset.mockBackgroundMode || "manual-only") !== "manual-only";
    return {
      isAdmin: true,
      settings: {
        realExecutionEnabled,
        backgroundProcessingEnabled,
        backgroundLowLoadOnly: true,
        backgroundMaxLoadPercent: 70,
        backgroundMaxLoad1m: 2.8,
        quietHoursEnabled: false,
        quietHoursStart: "22:00",
        quietHoursEnd: "06:00",
      },
      backgroundGate: mockBackgroundGate(backgroundProcessingEnabled),
    };
  }

  function mockBackgroundGate(canRun = false) {
    return {
      canRun,
      reason: canRun ? "ready" : "server_load_too_high",
      message: canRun ? "Automatik darf laufen: Serverauslastung 10.5% liegt unter 70.0%. Der nächste Nextcloud-Cronlauf verarbeitet freigegebene Ablagen." : "Automatik wartet: Serverauslastung 85.0% liegt über 70.0%. Linux-Load 3.40 bei 4 CPU-Kernen.",
      lowLoadOnly: true,
      currentLoad1m: canRun ? 0.42 : 3.4,
      maxLoad1m: 2.8,
      cpuCount: 4,
      currentLoadPercent: canRun ? 10.5 : 85,
      maxLoadPercent: 70,
      loadOk: true,
      quietHoursEnabled: false,
      quietHoursStart: "22:00",
      quietHoursEnd: "06:00",
      quietHoursOk: true,
      currentTime: "12:00",
    };
  }

  function mockSortState(jobId, pageOptions = {}) {
    const baseJob = state.jobs.find((item) => item.id === jobId) || mockJobs().find((item) => item.id === jobId) || mockJobs()[0];
    const total = mockImageCount();
    const limit = Math.max(1, Math.min(PAGE_LIMIT, Number(pageOptions.limit || PAGE_LIMIT)));
    const cursor = Math.max(0, Math.min(Math.max(0, total - 1), Number(pageOptions.cursor || 0)));
    const images = mockImagesForPage(baseJob, cursor, limit);
    const job = {
      ...baseJob,
      totalFiles: Math.max(Number(baseJob.totalFiles || 0), total),
    };
    return {
      job,
      favorites: mockFavoritesForJob(job),
      nextImages: images,
      imagePage: {
        cursor,
        limit,
        total,
        returned: images.length,
        hasPrevious: cursor > 0,
        previousCursor: cursor > 0 ? Math.max(0, cursor - limit) : null,
        hasNext: cursor + images.length < total,
        nextCursor: cursor + images.length < total ? cursor + images.length : null,
        mode: "mock",
      },
      start: {
        mode: pageOptions.start || "resume",
        cursor,
        index: 0,
        fileId: images[0]?.fileId || null,
      },
      savedPosition: {
        cursor,
        index: 0,
        fileId: images[0]?.fileId || null,
        savedAt: null,
      },
      recentAssignments: [],
      queue: [],
    };
  }

  function mockImageCount() {
    const count = Number.parseInt(root.dataset.mockImageCount || "3", 10);
    return Math.max(3, Math.min(5000, Number.isFinite(count) ? count : 3));
  }

  function mockImagesForPage(job, cursor, limit) {
    if (mockImageCount() <= 3) {
      return mockBaseImages(job);
    }

    const total = mockImageCount();
    const end = Math.min(total, cursor + limit);
    const images = [];
    for (let index = cursor; index < end; index += 1) {
      images.push(mockGeneratedImage(job, index));
    }
    return images;
  }

  function mockBaseImages(job) {
    return [
      {
        fileId: 11,
        name: "IMG_4021.jpg",
        path: `${job.sourcePath}/IMG_4021.jpg`,
        mimeType: "image/jpeg",
        previewUrl: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1200 800'%3E%3Crect width='1200' height='800' fill='%231d1d1d'/%3E%3Cpath d='M80 650 380 310l190 230 150-160 400 270z' fill='%23b7eadf'/%3E%3Ccircle cx='880' cy='190' r='80' fill='%23f4a4b8'/%3E%3C/svg%3E",
        thumbnailUrl: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 320 220'%3E%3Crect width='320' height='220' fill='%231d1d1d'/%3E%3Cpath d='M20 185 105 80l50 70 44-50 100 85z' fill='%23b7eadf'/%3E%3C/svg%3E",
      },
      {
        fileId: 12,
        name: "IMG_4022.jpg",
        path: `${job.sourcePath}/IMG_4022.jpg`,
        mimeType: "image/jpeg",
        previewUrl: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1200 800'%3E%3Crect width='1200' height='800' fill='%232f3d46'/%3E%3Cpath d='M0 600 280 350l200 190 260-290 460 350v200H0z' fill='%23d94f70'/%3E%3Ccircle cx='980' cy='150' r='70' fill='%23ffe8a3'/%3E%3C/svg%3E",
        thumbnailUrl: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 320 220'%3E%3Crect width='320' height='220' fill='%232f3d46'/%3E%3Cpath d='M0 180 80 95l60 55 70-82 110 112v40H0z' fill='%23d94f70'/%3E%3C/svg%3E",
      },
      {
        fileId: 13,
        name: "IMG_4023.jpg",
        path: `${job.sourcePath}/IMG_4023.jpg`,
        mimeType: "image/jpeg",
        previewUrl: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1200 800'%3E%3Crect width='1200' height='800' fill='%2332254a'/%3E%3Cpath d='M120 620 360 260l180 250 140-130 380 240z' fill='%237357c8'/%3E%3Ccircle cx='930' cy='210' r='88' fill='%23b7eadf'/%3E%3C/svg%3E",
        thumbnailUrl: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 320 220'%3E%3Crect width='320' height='220' fill='%2332254a'/%3E%3Cpath d='M30 180 102 65l52 80 42-40 104 75z' fill='%237357c8'/%3E%3C/svg%3E",
      },
    ];
  }

  function mockGeneratedImage(job, index) {
    const number = String(index + 1).padStart(4, "0");
    const palette = [
      ["#1d1d1d", "#b7eadf", "#f4a4b8"],
      ["#2f3d46", "#d94f70", "#ffe8a3"],
      ["#33254a", "#7357c8", "#b7eadf"],
      ["#163f3a", "#ffd36e", "#d94f70"],
    ][index % 4];
    return {
      fileId: 10000 + index,
      name: `IMG_${number}.jpg`,
      path: `${job.sourcePath}/IMG_${number}.jpg`,
      mimeType: "image/jpeg",
      previewUrl: mockSvgDataUrl(1200, 800, palette, number),
      thumbnailUrl: mockSvgDataUrl(320, 220, palette, number),
    };
  }

  function mockSvgDataUrl(width, height, palette, label) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="${palette[0]}"/><path d="M0 ${height * 0.82} ${width * 0.25} ${height * 0.45} ${width * 0.42} ${height * 0.68} ${width * 0.62} ${height * 0.36} ${width} ${height * 0.82}V${height}H0z" fill="${palette[1]}"/><circle cx="${width * 0.8}" cy="${height * 0.23}" r="${Math.max(18, width * 0.06)}" fill="${palette[2]}"/><text x="${width * 0.06}" y="${height * 0.18}" fill="#ffffff" font-family="Arial" font-size="${Math.max(22, width * 0.06)}" font-weight="700">${label}</text></svg>`;
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
  }

  function mockRealFavorites() {
    if (state.mockFavorites) {
      return state.mockFavorites;
    }
    return [
      { id: "family", label: "Familie", targetId: "family", hotkey: "1", position: 1, locked: false },
      { id: "travel", label: "Reisen", targetId: "travel", hotkey: "2", position: 2, locked: false },
      { id: "archive", label: "Archiv", targetId: "archive", hotkey: "3", position: 3, locked: false },
    ];
  }

  function mockFavoritesWithSkip(favorites) {
    return [
      ...favorites,
      { id: "skip", label: "Überspringen", hotkey: "0", position: 10, locked: true, targetType: "skip" },
    ];
  }

  function mockFavoritesForJob(job) {
    const favorites = mockRealFavorites().map((favorite, index) => ({
      ...favorite,
      position: index + 1,
      hotkey: hotkeyForPosition(index + 1, job.options || {}),
    }));
    return mockFavoritesWithSkip(favorites);
  }

  function mockTargets() {
    if (state.mockTargets) {
      return state.mockTargets;
    }
    return [
      { id: "family", label: "Familie", location: "Privat" },
      { id: "travel", label: "Reisen", location: "Jahresalben" },
      { id: "archive", label: "Archiv", location: "Langzeit" },
      { id: "work", label: "Projekte", location: "Arbeit" },
    ];
  }

  function filterMockTargets(targets, query) {
    const needle = normalizeSearchTerm(query);
    if (!needle) {
      return targets;
    }
    return targets.filter((target) => normalizeSearchTerm(`${target.label || target.name || ""} ${target.location || target.path || ""}`).includes(needle));
  }

  function mockFolderPage(path, query = "") {
    const normalized = normalizeDisplayPath(path || "/");
    const tree = {
      "/": [
        { name: "Camera", path: "/Camera", hasChildren: true },
        { name: "Photos", path: "/Photos", hasChildren: true },
        { name: "Projects", path: "/Projects", hasChildren: false },
      ],
      "/Camera": [
        { name: "Unsortiert", path: "/Camera/Unsortiert", hasChildren: false },
      ],
      "/Photos": [
        { name: "Inbox", path: "/Photos/Inbox", hasChildren: false },
        { name: "Sortiert", path: "/Photos/Sortiert", hasChildren: false },
      ],
    };
    const folderSource = { ...tree, ...(state.mockFolders || {}) };
    const folders = query
      ? filterMockTargets(flattenMockFolders(folderSource, normalized), query)
      : filterMockTargets(folderSource[normalized] || [], query);
    return {
      current: {
        name: normalized === "/" ? "Dateien" : normalized.split("/").filter(Boolean).at(-1),
        path: normalized,
      },
      parent: parentPath(normalized),
      folders,
      imageCount: normalized === "/Photos" ? 3 : 0,
      total: folders.length,
      limit: 150,
      truncated: false,
    };
  }

  function flattenMockFolders(folderSource, rootPath) {
    const result = [];
    const pending = [...(folderSource[rootPath] || [])];
    while (pending.length) {
      const folder = pending.shift();
      result.push(folder);
      pending.push(...(folderSource[folder.path] || []));
    }
    return result;
  }

  function mockWorklistPreview(job) {
    if (root.dataset.mockWorklistExecutedMove === "1") {
      return mockExecutedMovePreview(job);
    }
    const withBlockingError = root.dataset.mockWorklistErrors === "1"
      && root.dataset.mockRepairTargetCreated !== "1"
      && root.dataset.mockWorklistErrorReset !== "1";
    const targetConflictMode = root.dataset.mockWorklistTargetConflict === "1";
    const conflictRenamed = root.dataset.mockWorklistConflictRenamed === "1";
    const conflictReset = root.dataset.mockWorklistConflictReset === "1";
    const withTargetConflict = targetConflictMode && !conflictRenamed && !conflictReset;
    const mode = withBlockingError ? "copy" : (targetConflictMode ? "move" : (job.targetMode || "album"));
    const queued = job.status === "queued";
    const itemStatus = queued ? "queued" : "planned";
    const secondItemStatus = withTargetConflict ? "blocked" : itemStatus;
    const realExecutionEnabled = root.dataset.mockRealExecution === "1";
    const configuredBackgroundMode = root.dataset.mockBackgroundMode || "manual-only";
    const backgroundMode = realExecutionEnabled ? configuredBackgroundMode : "manual-only";
    const total = Math.max(3, Number.parseInt(root.dataset.mockWorklistTotal || "3", 10) || 3);
    const warnings = (withBlockingError || targetConflictMode) ? 0 : (total > 3 ? Math.max(1, Math.floor(total * 0.12)) : 1);
    const errors = (withBlockingError || withTargetConflict) ? 1 : 0;
    const ready = Math.max(0, total - warnings - errors);
    const targetPath = mode === "album" ? null : (withBlockingError ? "/Photos/Fehlender Testordner" : (targetConflictMode ? "/Photos/S/BrasilienFotos" : (job.targetPath || "/Photos/Sortiert")));
    const secondIssues = withBlockingError
      ? [{
        code: "target_folder_missing",
        severity: "error",
        message: "Zielordner fehlt oder ist nicht lesbar.",
        action: "create_target_folder",
      }]
      : withTargetConflict
      ? [{
        code: "target_file_exists",
        severity: "error",
        message: "Zieldatei existiert bereits. Wähle einen neuen Namen oder entferne diesen Ablagepunkt.",
        action: "auto_rename_target",
      }]
      : [{
        code: "target_file_exists",
        severity: "warning",
        message: "Zieldatei existiert bereits; diese Doppelung wird später sicher übersprungen.",
        action: "safe_skip_duplicate",
      }];
    const secondReady = conflictRenamed || conflictReset;
    const secondTargetFileName = conflictRenamed ? "IMG_4022 (1).jpg" : null;
    return {
      job: {
        id: job.id,
        name: job.name,
        targetMode: mode,
        safeMode: job.safeMode !== false,
        status: job.status || "sorting",
        options: job.options || {},
      },
      summary: {
        total,
        planned: queued ? 0 : total,
        queued: queued ? total : 0,
        executing: 0,
        blocked: withTargetConflict ? 1 : 0,
        executed: 0,
        failed: 0,
        ready,
        warnings,
        errors,
      },
      window: {
        total,
        shown: 3,
        limit: 3,
        truncated: total > 3,
        validationComplete: true,
      },
      canQueue: !queued && errors === 0,
      executionMode: realExecutionEnabled ? "real-writes-enabled" : "dry-run-only",
      backgroundMode,
      backgroundGate: mockBackgroundGate(backgroundMode === "cron-ready" || backgroundMode === "cron-enabled"),
      autoProcess: Boolean(job.options?.autoProcess),
      message: realExecutionEnabled
        ? "Echte Dateiänderungen sind serverseitig freigeschaltet. Jede Ablage wird trotzdem noch einmal auf Doppelungen, Zielkonflikte und Prüfsummen geprüft."
        : "Dateiänderungen sind gesperrt. Du kannst die Ablage prüfen und für später merken, ohne Dateien zu verändern.",
      items: [
        {
          id: 1,
          operationType: mode,
          sourcePath: `${job.sourcePath || "/Photos"}/IMG_4021.jpg`,
          targetPath,
          targetAlbumId: mode === "album" ? "family" : null,
          status: itemStatus,
          safeMode: true,
          readiness: "ready",
          issues: [],
          messages: ["Bereit für die sichere Prüfung mit Checksumme."],
        },
        {
          id: 2,
          operationType: mode,
          sourcePath: `${job.sourcePath || "/Photos"}/IMG_4022.jpg`,
          targetPath,
          targetAlbumId: mode === "album" ? "travel" : null,
          targetFileName: secondTargetFileName,
          status: secondReady ? "queued" : secondItemStatus,
          safeMode: true,
          readiness: secondReady ? "ready" : (withBlockingError || withTargetConflict ? "error" : "warning"),
          issues: secondReady ? [] : secondIssues,
          messages: secondReady
            ? (conflictRenamed ? ["Bereit für die sichere Prüfung mit Checksumme.", "Zielname: IMG_4022 (1).jpg"] : ["Bereit für die sichere Prüfung mit Checksumme."])
            : (withTargetConflict
              ? ["Zieldatei existiert bereits. Verschieben überschreibt nicht und löscht die Quelle nicht.", ...secondIssues.map((issue) => issue.message)]
              : secondIssues.map((issue) => issue.message)),
        },
        {
          id: 3,
          operationType: mode,
          sourcePath: `${job.sourcePath || "/Photos"}/IMG_4023.jpg`,
          targetPath,
          targetAlbumId: mode === "album" ? "archive" : null,
          status: itemStatus,
          safeMode: true,
          readiness: "ready",
          issues: [],
          messages: ["Bereit für die sichere Prüfung mit Checksumme."],
        },
      ],
    };
  }

  function mockExecutedMovePreview(job) {
    const total = 3;
    return {
      job: {
        id: job.id,
        name: job.name,
        targetMode: "move",
        safeMode: job.safeMode !== false,
        status: "done",
        options: job.options || {},
      },
      summary: {
        total,
        planned: 0,
        queued: 0,
        executing: 0,
        blocked: 0,
        executed: total,
        failed: 0,
        ready: total,
        warnings: 0,
        errors: 0,
      },
      window: {
        total,
        shown: total,
        limit: total,
        truncated: false,
        validationComplete: true,
      },
      canQueue: false,
      executionMode: root.dataset.mockRealExecution === "1" ? "real-writes-enabled" : "dry-run-only",
      backgroundMode: "manual-only",
      backgroundGate: mockBackgroundGate(false),
      autoProcess: Boolean(job.options?.autoProcess),
      message: "Echte Dateiänderungen sind serverseitig freigeschaltet. Jede Ablage wird trotzdem noch einmal auf Doppelungen, Zielkonflikte und Prüfsummen geprüft.",
      items: [1, 2, 3].map((number) => ({
        id: number,
        operationType: "move",
        sourcePath: `${job.sourcePath || "/Photos"}/verschoben_${number}.jpg`,
        targetPath: job.targetPath || "/Photos/Sortiert",
        targetAlbumId: null,
        status: "executed",
        safeMode: true,
        readiness: "ready",
        issues: [],
        messages: ["Bereits abgelegt."],
      })),
    };
  }

  async function mockDecisionDelay() {
    const delay = Number.parseInt(root.dataset.mockDecisionDelayMs || "0", 10);
    if (delay > 0) {
      await new Promise((resolve) => window.setTimeout(resolve, Math.min(delay, 2000)));
    }
  }

  function mockLogs() {
    const now = Math.floor(Date.now() / 1000);
    return [
      {
        id: 1003,
        level: "debug",
        event: "image_buffer_synced",
        jobId: state.jobId || 1,
        message: "Bilder rund um die aktuelle Position wurden vorgeladen.",
        context: { bufferedImages: state.bufferPlan.length || 9, preloadMode: "turbo" },
        createdAt: now - 8,
      },
      {
        id: 1002,
        level: "info",
        event: "job_execution_queued",
        jobId: 1,
        message: "Ablage wurde vorgemerkt.",
        context: { safeMode: true, autoProcess: false },
        createdAt: now - 80,
      },
      {
        id: 1001,
        level: "debug",
        event: "assignment_planned",
        jobId: 1,
        message: "Deine Entscheidung wurde gespeichert.",
        context: { sourcePath: "/Photos/Inbox/IMG_4021.jpg", targetLabel: "Familie" },
        createdAt: now - 160,
      },
    ];
  }

  async function load() {
    state.loading = true;
    render();
    try {
      if (state.page === "sort" && state.jobId) {
        await loadImagePage(state.pageCursor, null, false, state.startMode);
      } else if (state.page === "settings") {
        await loadHealth();
        await loadAdminSettings();
      } else if (state.page === "logs") {
        const params = new URLSearchParams({ limit: "120" });
        const payload = await request(`/api/v1/logs?${params.toString()}`);
        state.logs.items = payload.logs || [];
        state.logs.diagnostics = payload.diagnostics || null;
      } else {
        const payload = await request("/api/v1/jobs");
        state.jobs = payload.jobs || [];
        await loadHealth();
      }
    } catch (error) {
      state.toast = { type: "error", message: error.message || "ImageFlow konnte nicht geladen werden." };
    } finally {
      state.loading = false;
      render();
    }

    async function loadHealth() {
      try {
        state.health = await request("/api/v1/health");
      } catch (error) {
        state.health = null;
      }
    }
  }

  async function loadImagePage(cursor = null, preferredIndex = null, renderLoading = true, startMode = null) {
    if (!state.jobId) {
      return;
    }
    const requestedCursor = cursor !== null && cursor !== undefined ? Math.max(0, Number(cursor) || 0) : null;
    const requestedStart = requestedCursor === null ? startMode || state.startMode : null;
    const cached = requestedStart === null && requestedCursor !== null ? imagePageCache.get(imagePageCacheKey(state.jobId, requestedCursor)) : null;
    if (cached) {
      root.dataset.pageCacheHit = "1";
      await applyImagePagePayload(cached, preferredIndex, requestedStart);
      persistPositionSoon();
      render();
      return;
    }

    if (renderLoading) {
      state.loading = true;
      render();
    }

    const params = new URLSearchParams({ limit: String(PAGE_LIMIT) });
    if (requestedCursor !== null) {
      params.set("cursor", String(requestedCursor));
    } else if (requestedStart) {
      params.set("start", requestedStart);
    }

    try {
      const payload = await request(`/api/v1/jobs/${state.jobId}/sort-state?${params.toString()}`);
      root.dataset.pageCacheHit = "0";
      rememberImagePage(payload);
      await applyImagePagePayload(payload, preferredIndex, requestedStart);
      persistPositionSoon();
    } finally {
      if (renderLoading) {
        state.loading = false;
        render();
      }
    }
  }

  async function applyImagePagePayload(payload, preferredIndex = null, requestedStart = null) {
    state.sortState = mergeSortPayload(payload);
    state.imagePage = state.sortState.imagePage || defaultImagePage(state.sortState.nextImages || []);
    state.pageCursor = Number(state.imagePage.cursor || 0);
    const saved = state.sortState.savedPosition || {};
    const start = state.sortState.start || {};
    const startCursor = Number(start.cursor || 0);
    const savedIndex = Number(saved.cursor || 0) === state.pageCursor ? Number(saved.index || 0) : 0;
    const startIndex = requestedStart && startCursor === state.pageCursor ? Number(start.index || 0) : null;
    state.imageIndex = clampIndex(preferredIndex ?? startIndex ?? savedIndex, sortImages(state.sortState));
    if (requestedStart === "begin") {
      setProgressBaseline(state.sortState.job);
    } else if (requestedStart === "resume" || requestedStart === "unsorted") {
      clearProgressBaseline();
    }
    state.startMode = null;
    await loadTargets(state.sortState.job.targetMode);
  }

  async function loadTargets(mode) {
    const targetMode = mode || "album";
    const ordering = state.sortState?.job?.options?.targetOrdering || "relevance";
    const query = state.targetQuery.trim();
    if (targetMode !== "album") {
      if (!state.targetBrowsePath) {
        state.targetBrowsePath = state.sortState?.job?.targetPath || DEFAULT_TARGET_PATH;
      }
      await loadFolderTargetsWithFallback(targetMode, ordering, query);
      return;
    }

    const params = targetParams(targetMode, ordering, query);
    const payload = await request(`/api/v1/targets?${params.toString()}`);
    state.targetFolderPage = payload.folders || null;
    state.targets = payload.targets || payload.folders?.folders || [];
  }

  async function loadFolderTargetsWithFallback(targetMode, ordering, query) {
    const requestedPath = normalizeDisplayPath(state.targetBrowsePath || state.sortState?.job?.targetPath || DEFAULT_TARGET_PATH);
    let currentPath = requestedPath;
    let lastError = null;

    while (true) {
      const params = targetParams(targetMode, ordering, query);
      params.set("path", currentPath);
      try {
        const payload = await request(`/api/v1/targets?${params.toString()}`);
        state.targetFolderPage = payload.folders || null;
        state.targetBrowsePath = payload.folders?.current?.path || currentPath;
        state.targets = payload.targets || payload.folders?.folders || [];
        if (currentPath !== requestedPath) {
          state.toast = {
            type: "info",
            message: `Der Zielordner ${requestedPath} wurde nicht gefunden. Ich zeige ${state.targetBrowsePath}.`,
          };
        }
        return;
      } catch (error) {
        lastError = error;
        const fallback = parentPath(currentPath);
        if (!fallback || fallback === currentPath) {
          state.targetBrowsePath = currentPath;
          throw lastError;
        }
        currentPath = fallback;
      }
    }
  }

  function targetParams(targetMode, ordering, query) {
    const params = new URLSearchParams({ mode: targetMode, limit: "100", ordering });
    if (query) {
      params.set("query", query);
    }
    return params;
  }

  function render() {
    mount.setAttribute("aria-busy", state.loading ? "true" : "false");
    mount.innerHTML = `
      <div class="imageflow-app">
        ${renderTopbar()}
        <main class="imageflow-content ${state.page === "sort" ? "imageflow-content-sort" : ""}">
          ${state.page === "sort" ? renderSortPage() : (state.page === "logs" ? renderLogsPage() : (state.page === "settings" ? renderSettingsPage() : renderJobsPage()))}
          ${renderToast()}
          ${renderFolderPicker()}
          ${renderWorklistPreview()}
        </main>
      </div>
    `;
    applyUiHelpAndTranslations();
    bindActions();
    syncImageBuffer();
    if (scrollToTopOnRender) {
      mount.scrollTop = 0;
      scrollToTopOnRender = false;
    }
  }

  function renderTopbar() {
    const debugUi = debugUiEnabled();
    const adminSettingsPage = root.dataset.adminSettings === "1";
    return `
      <header class="imageflow-topbar">
        <span class="imageflow-mark" aria-hidden="true"><span></span></span>
        <div class="imageflow-title">
          <h2>${adminSettingsPage ? "ImageFlow Betrieb" : "ImageFlow"}</h2>
          <p>${adminSettingsPage ? "Globale Servereinstellungen für Ablage, Automatik und Prüflast." : "Viele Bilder schnell durchsehen, entscheiden und sicher ablegen."}</p>
        </div>
        ${adminSettingsPage ? "" : `<nav class="imageflow-tabs" aria-label="ImageFlow">
          <button class="imageflow-tab ${state.page === "jobs" ? "is-active" : ""}" data-action="go-jobs" type="button">Übersicht</button>
          <button class="imageflow-tab ${state.page === "sort" ? "is-active" : ""}" data-action="go-sort" type="button" ${state.jobId ? "" : "disabled"}>Sortieren</button>
          ${debugUi ? `<button class="imageflow-tab ${state.page === "logs" ? "is-active" : ""}" data-action="show-log" type="button">Protokoll</button>` : ""}
        </nav>`}
      </header>
    `;
  }

  function debugUiEnabled() {
    return root.dataset.debugUi === "1";
  }

  function activeUiLanguage() {
    if (root.dataset.language) {
      return normalizeUiLanguage(root.dataset.language);
    }
    if (hasNextcloud && typeof window.OC?.getLanguage === "function") {
      return normalizeUiLanguage(window.OC.getLanguage());
    }
    if (hasNextcloud && document.documentElement?.lang) {
      return normalizeUiLanguage(document.documentElement.lang);
    }
    return "de";
  }

  function normalizeUiLanguage(language) {
    const value = String(language || "de").trim().toLowerCase().replace("_", "-");
    const base = value.split("-")[0] || "de";
    return base === "de" || UI_TRANSLATIONS[base] ? base : "de";
  }

  function applyUiHelpAndTranslations() {
    applyMouseoverHelp();
    const language = activeUiLanguage();
    if (language === "de") {
      return;
    }
    translateTextNodes(mount, language);
    translateAttributes(mount, language);
  }

  function applyMouseoverHelp() {
    root.querySelectorAll("[data-action]").forEach((element) => {
      if (element.getAttribute("title")) {
        return;
      }
      const help = ACTION_HELP_DE[element.dataset.action || ""];
      if (help) {
        element.setAttribute("title", help);
      }
    });

    root.querySelectorAll("label").forEach((element) => {
      if (element.getAttribute("title")) {
        return;
      }
      const key = compactText(element.textContent || "");
      const help = CONTROL_HELP_DE[key];
      if (help) {
        element.setAttribute("title", help);
        const control = element.control || (element.htmlFor ? document.getElementById(element.htmlFor) : element.querySelector("input, select, textarea"));
        if (control && !control.getAttribute("title")) {
          control.setAttribute("title", help);
        }
      }
    });

    root.querySelectorAll("button:not([title])").forEach((element) => {
      const key = compactText(element.textContent || "");
      const help = CONTROL_HELP_DE[key] || ACTION_HELP_DE[element.dataset.action || ""];
      if (help) {
        element.setAttribute("title", help);
      }
    });
  }

  function translateTextNodes(container, language) {
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent || ["SCRIPT", "STYLE", "TEXTAREA", "CODE"].includes(parent.tagName)) {
          return NodeFilter.FILTER_REJECT;
        }
        return compactText(node.nodeValue || "") ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      },
    });
    const nodes = [];
    while (walker.nextNode()) {
      nodes.push(walker.currentNode);
    }
    nodes.forEach((node) => {
      node.nodeValue = translateUiString(node.nodeValue || "", language);
    });
  }

  function translateAttributes(container, language) {
    const attrs = ["aria-label", "title", "placeholder", "alt"];
    container.querySelectorAll(attrs.map((attr) => `[${attr}]`).join(",")).forEach((element) => {
      attrs.forEach((attr) => {
        const value = element.getAttribute(attr);
        if (value) {
          element.setAttribute(attr, translateUiString(value, language));
        }
      });
    });
  }

  function translateUiString(value, language) {
    const dictionary = UI_TRANSLATIONS[language];
    if (!dictionary) {
      return value;
    }
    const leading = value.match(/^\s*/)?.[0] || "";
    const trailing = value.match(/\s*$/)?.[0] || "";
    const compact = compactText(value);
    if (!compact) {
      return value;
    }
    if (dictionary.terms[compact]) {
      return `${leading}${dictionary.terms[compact]}${trailing}`;
    }
    for (const [pattern, replacement] of dictionary.patterns || []) {
      if (pattern.test(compact)) {
        return `${leading}${compact.replace(pattern, replacement)}${trailing}`;
      }
    }
    return value;
  }

  function compactText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function isAdminUser() {
    return Boolean(state.health?.diagnostics?.isAdmin || state.adminSettings.data?.isAdmin);
  }

  function renderJobsPage() {
    const totals = summarizeJobs(state.jobs);
    const draft = state.jobDraft;
    const isEditing = Boolean(draft.editingJobId);
    return `
	      <section class="imageflow-dashboard" aria-label="Foto-Flows">
	        ${renderSafetyStrip()}
	        <section class="imageflow-flow-start" aria-label="Flow anlegen">
	          <div>
	            <strong>Bereit für die nächste Bilderrunde?</strong>
	            <span>Lege einen Flow an, wähle Ordner und Zielart, und sortiere danach Bild für Bild.</span>
	          </div>
	          <button class="imageflow-button primary" data-action="focus-new-flow" type="button">Flow anlegen</button>
	        </section>
	        <form class="imageflow-panel accent-pink imageflow-form" id="imageflow-job-form">
          <div class="imageflow-panel-head">
            <div>
              <h3>${isEditing ? "Flow bearbeiten" : "Neuen Flow vorbereiten"}</h3>
              <p>${isEditing ? "Passe Name und Einstellungen an. Quelle und Ziel bleiben gesperrt, sobald Entscheidungen vorhanden sind." : "Speichere den Flow zuerst oder spring direkt in den Sortiermodus."}</p>
            </div>
          </div>
          <div class="imageflow-field">
            <label for="ifl-name">Name</label>
            <input id="ifl-name" name="name" type="text" maxlength="160" placeholder="z. B. Urlaub 2026" value="${escapeAttr(draft.name)}">
          </div>
          <div class="imageflow-field">
            <label for="ifl-source">Bilderordner</label>
            <div class="imageflow-path-picker">
              <input id="ifl-source" name="sourcePath" type="text" value="${escapeAttr(draft.sourcePath)}" autocomplete="off">
              <button class="imageflow-button" data-action="open-folder-picker" data-picker-field="sourcePath" type="button">Auswählen</button>
            </div>
            <small>ImageFlow nutzt nur Ordner aus deinem Nextcloud-Dateibereich.</small>
          </div>
          <label class="imageflow-toggle imageflow-toggle-compact">
            <input id="ifl-recursive" name="recursiveSource" type="checkbox" ${draft.recursiveSource ? "checked" : ""}>
            Unterordner mit einbeziehen
          </label>
          <div class="imageflow-field">
            <label for="ifl-mode">Wie sollen sortierte Bilder abgelegt werden?</label>
            <select id="ifl-mode" name="targetMode">
              <option value="album" ${draft.targetMode === "album" ? "selected" : ""}>Zu einem Album hinzufügen</option>
              <option value="move" ${draft.targetMode === "move" ? "selected" : ""}>In einen Ordner verschieben</option>
              <option value="copy" ${draft.targetMode === "copy" ? "selected" : ""}>In einen Ordner kopieren</option>
            </select>
          </div>
          <div class="imageflow-field" data-target-path-field hidden>
            <label for="ifl-target">Zielordner</label>
            <div class="imageflow-path-picker">
              <input id="ifl-target" name="targetPath" type="text" value="${escapeAttr(draft.targetPath)}" autocomplete="off">
              <button class="imageflow-button" data-action="open-folder-picker" data-picker-field="targetPath" type="button">Auswählen</button>
            </div>
          </div>
          <label class="imageflow-toggle">
            <input id="ifl-safe" name="safeMode" type="checkbox" ${draft.safeMode ? "checked" : ""}>
            Mit Prüfsummen extra sicher prüfen
          </label>
          <label class="imageflow-toggle">
            <input id="ifl-auto" name="autoProcess" type="checkbox" ${draft.autoProcess ? "checked" : ""}>
            Automatisch ablegen, wenn der Server ruhig ist
          </label>
          <div class="imageflow-field">
            <label for="ifl-preload">Vorschau laden</label>
            <select id="ifl-preload" name="preloadMode">
              <option value="light" ${draft.preloadMode === "light" ? "selected" : ""}>Schonend</option>
              <option value="balanced" ${draft.preloadMode === "balanced" ? "selected" : ""}>Ausgewogen</option>
              <option value="turbo" ${draft.preloadMode === "turbo" ? "selected" : ""}>Turbo für große Stapel</option>
            </select>
          </div>
          <div class="imageflow-field">
            <label for="ifl-target-ordering">Ziel-Reihenfolge</label>
            <select id="ifl-target-ordering" name="targetOrdering">
              <option value="relevance" ${draft.targetOrdering === "relevance" ? "selected" : ""}>Passende Ziele zuerst</option>
              <option value="alphabetical" ${draft.targetOrdering === "alphabetical" ? "selected" : ""}>Alphabetisch</option>
            </select>
          </div>
          <div class="imageflow-field">
            <label for="ifl-hotkeys">Tastenbelegung</label>
            <select id="ifl-hotkeys" name="hotkeys">
              <option value="number-row" ${draft.hotkeys === "number-row" ? "selected" : ""}>Zahlen 1-9 und 0</option>
              <option value="letters" ${draft.hotkeys === "letters" ? "selected" : ""}>Buchstaben A-I und 0</option>
              <option value="custom" ${draft.hotkeys === "custom" ? "selected" : ""}>Eigene Tasten</option>
            </select>
          </div>
          ${renderCustomHotkeyFields(draft)}
          <div class="imageflow-actions">
            <button class="imageflow-button primary" type="submit" data-save-intent="save">${isEditing ? "Änderungen speichern" : "Flow speichern"}</button>
            <button class="imageflow-button" type="submit" data-save-intent="open">Speichern & loslegen</button>
            ${isEditing ? '<button class="imageflow-button" data-action="cancel-edit-job" type="button">Bearbeiten abbrechen</button>' : '<button class="imageflow-button" data-action="clear-job-draft" type="button">Zurücksetzen</button>'}
          </div>
        </form>
        <section class="imageflow-panel imageflow-flow-list-panel">
          <div class="imageflow-panel-head">
            <div>
              <h3>Deine Flows</h3>
              <p>Fortschritt, Tempo und Ablage bleiben hier im Blick.</p>
            </div>
            <button class="imageflow-button" data-action="refresh" type="button">Neu laden</button>
          </div>
          <div class="imageflow-status-grid">
            <div class="imageflow-stat"><strong>${totals.jobs}</strong><span>Flows</span></div>
            <div class="imageflow-stat"><strong>${totals.sorted}</strong><span>Entschieden</span></div>
            <div class="imageflow-stat"><strong>${totals.planned}</strong><span>Wartet</span></div>
            <div class="imageflow-stat"><strong>${totals.queued}</strong><span>Ausführbar</span></div>
            <div class="imageflow-stat"><strong>${totals.failed}</strong><span>Fehler</span></div>
          </div>
          ${renderJobTable()}
        </section>
        ${debugUiEnabled() ? renderSystemCheckPanel() : ""}
      </section>
    `;
  }

  function renderCustomHotkeyFields(draft) {
    const keys = normalizeCustomHotkeys(draft.customHotkeys || []);
    return `
      <div class="imageflow-field imageflow-custom-hotkeys" ${draft.hotkeys === "custom" ? "" : "hidden"}>
        <label>Eigene Schnellziel-Tasten</label>
        <div class="imageflow-hotkey-grid">
          ${Array.from({ length: 9 }, (_, index) => `
            <label>
              <span>${index + 1}</span>
              <input class="imageflow-hotkey-input" name="customHotkey${index}" data-hotkey-index="${index}" type="text" maxlength="1" value="${escapeAttr(keys[index] || "")}" aria-label="Taste für Schnellziel ${index + 1}">
            </label>
          `).join("")}
        </div>
        <small>Jede Taste darf nur einmal vorkommen. 0 und Leertaste bleiben für Überspringen reserviert.</small>
      </div>
    `;
  }

  function renderSafetyStrip() {
    const health = state.health || mockHealth();
    const realWrites = Boolean(health.realExecutionEnabled || health.destructiveWritesEnabled);
    const background = Boolean(health.backgroundProcessingEnabled);
    const gate = health.backgroundGate || {};
    const title = realWrites ? "Dateiänderungen aktiv" : "Geschützter Testbetrieb";
    const message = realWrites
      ? "Reale Dateiänderungen sind freigeschaltet. Ablagen können Dateien verändern."
      : "Reale Dateiänderungen sind gesperrt. Du kannst Ablagen prüfen und für später merken, ohne Dateien zu verändern.";
    const automationLabel = background
      ? ((gate.canRun || gate.reason === "ready") ? "Server ruhig" : "Automatik wartet")
      : "Automatik aus";
    return `
      <section class="imageflow-safety-strip ${realWrites ? "is-live" : ""}" aria-label="Schutzstatus">
        <div>
          <h3>${escapeHtml(title)}</h3>
          <p>${escapeHtml(message)}</p>
        </div>
        <div class="imageflow-safety-badges">
          <span class="imageflow-badge ${realWrites ? "warning" : "safe"}">${realWrites ? "Dateien können geändert werden" : "Dateiänderungen gesperrt"}</span>
          <span class="imageflow-badge ${background ? ((gate.canRun || gate.reason === "ready") ? "ready" : "warning") : ""}">${escapeHtml(automationLabel)}</span>
          <span class="imageflow-badge safe">Prüfsummen an</span>
          <button class="imageflow-mini-button" data-action="export-diagnostics" aria-label="Diagnose exportieren" title="Diagnose exportieren" type="button">i</button>
        </div>
      </section>
    `;
  }

  function renderSystemCheckPanel() {
    const health = state.health || mockHealth();
    const diagnostics = health.diagnostics || {};
    const checks = Array.isArray(diagnostics.checks) ? diagnostics.checks : [];
    const queue = diagnostics.queue || {};
    const ready = checks.every((check) => check.level === "ok");
    const selfTestSteps = [
      { label: "Mit albentest anmelden", state: diagnostics.testUserAllowed ? "ok" : "warning" },
      { label: "Dateiänderungen gesperrt", state: health.realExecutionEnabled ? "danger" : "ok" },
      { label: "Flow speichern und öffnen", state: "pending" },
      { label: "Entscheidung, Rückgängig und Ablage prüfen", state: "pending" },
      { label: "Ablage nur vormerken, nichts ausführen", state: health.backgroundProcessingEnabled || health.realExecutionEnabled ? "warning" : "ok" },
    ];
    return `
      <section class="imageflow-panel imageflow-system-panel ${ready ? "" : "accent-violet"}" aria-label="Systemprüfung">
        <div class="imageflow-panel-head">
          <div>
            <h3>Systemprüfung</h3>
            <p>${systemStatusMessage(health, diagnostics)}</p>
          </div>
          <button class="imageflow-button" data-action="refresh" type="button">Neu prüfen</button>
        </div>
        <div class="imageflow-system-grid">
          <div class="imageflow-system-card">
            <strong>Schutz</strong>
            <span>${health.realExecutionEnabled ? "Dateiänderungen aktiv" : "Dateiänderungen gesperrt"}</span>
            <small>${health.backgroundProcessingEnabled ? backgroundModeLabel(health.backgroundGate?.canRun ? "cron-ready" : "cron-waiting") : "Automatik aus"}</small>
          </div>
          <div class="imageflow-system-card">
            <strong>Daten</strong>
            <span>${Number(diagnostics.jobCount || 0)} Flows</span>
            <small>${Number(queue.total || 0)} Ablagepunkte, ${Number(queue.issues || 0)} auffällig</small>
          </div>
          <div class="imageflow-system-card">
            <strong>Geführter Test</strong>
            <span>${diagnostics.testUserAllowed ? "Testkonto aktiv" : "Nur mit albentest"}</span>
            <small>${diagnostics.testUserAllowed ? "Geführter Test ist erlaubt." : "Produktive Konten nicht für Testläufe nutzen."}</small>
          </div>
        </div>
        <div class="imageflow-check-grid">
          ${checks.map(renderSystemCheck).join("")}
        </div>
        <div class="imageflow-selftest">
          <div>
            <strong>Geführter Testlauf</strong>
            <span>Diese Schritte prüfen die App-Funktionen ohne echte Dateiänderungen.</span>
          </div>
          <div class="imageflow-selftest-steps">
            ${selfTestSteps.map(renderSelfTestStep).join("")}
          </div>
        </div>
      </section>
    `;
  }

  function renderSystemCheck(check) {
    const level = check.level === "error" ? "danger" : check.level === "warning" ? "warning" : "safe";
    return `
      <article class="imageflow-check-row">
        <span class="imageflow-badge ${level}">${check.level === "ok" ? "OK" : check.level === "warning" ? "Prüfen" : "Stopp"}</span>
        <div>
          <strong>${escapeHtml(check.label || "Prüfung")}</strong>
          <span>${escapeHtml(check.message || "")}</span>
        </div>
      </article>
    `;
  }

  function renderSelfTestStep(step) {
    const level = step.state === "danger" ? "danger" : step.state === "warning" ? "warning" : step.state === "ok" ? "safe" : "";
    const label = step.state === "ok" ? "OK" : step.state === "warning" ? "Prüfen" : step.state === "danger" ? "Stopp" : "Offen";
    return `
      <span class="imageflow-selftest-step ${level}">
        <b>${label}</b>
        ${escapeHtml(step.label)}
      </span>
    `;
  }

  function systemStatusMessage(health, diagnostics) {
    if (health.realExecutionEnabled) {
      return "Echte Dateiänderungen sind aktiv. Nur mit bewusstem Testfenster und Backup verwenden.";
    }
    if (diagnostics.databaseOk === false) {
      return "Die App läuft, aber die Datenbankprüfung braucht Aufmerksamkeit.";
    }
    return "Die App ist im geschützten Testbetrieb und bereit für sichere Funktionsprüfungen.";
  }

  function renderJobTable() {
    if (state.jobs.length === 0) {
      return `<div class="imageflow-empty">Noch keine Flows vorhanden.</div>`;
    }

    return `
      <div class="imageflow-table-wrap">
        <table class="imageflow-table">
          <thead>
            <tr>
              <th>Flow</th>
              <th>Bilderordner</th>
              <th>Ablage</th>
              <th>Status</th>
              <th>Fortschritt</th>
              <th>Aktionen</th>
            </tr>
          </thead>
          <tbody>
            ${state.jobs.map(renderJobRow).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function jobQueueLabel(job) {
    return job?.status === "queued" ? "ausführbar" : "wartet";
  }

  function renderJobRow(job) {
    const options = job.options || {};
    const paused = job.status === "paused";
    const debugUi = debugUiEnabled();
    const hasDecisions = Number(job.sortedFiles || 0) + Number(job.skippedFiles || 0) + Number(job.queuedOperations || 0) > 0;
    const primaryStartLabel = hasDecisions ? "Weitermachen" : "Sortieren";
    const queueLabel = jobQueueLabel(job);
    const canProcessNow = job.status === "queued" && Number(job.queuedOperations || 0) > 0;
    return `
      <tr>
        <td>
          <strong>${escapeHtml(job.name)}</strong><br>
          <span class="imageflow-badge safe">${job.safeMode ? "Extra sicher" : "Standard"}</span>
          <span class="imageflow-badge ${options.autoProcess ? "ready" : ""}">${options.autoProcess ? "Automatik an" : "Manuell"}</span>
          ${options.recursiveSource ? '<span class="imageflow-badge ready">Mit Unterordnern</span>' : ""}
          <span class="imageflow-badge">${targetOrderingLabel(options.targetOrdering)}</span>
        </td>
        <td>${escapeHtml(job.sourcePath || "/")}</td>
        <td>${modeLabel(job.targetMode)}</td>
        <td>
          <span class="imageflow-badge ${statusClass(job.status)}">${statusLabel(job.status)}</span>
          ${renderJobLastStatus(job)}
        </td>
        <td>${Number(job.sortedFiles || 0)} entschieden<br>${Number(job.queuedOperations || 0)} ${queueLabel}</td>
        <td>
          <div class="imageflow-actions">
            <button class="imageflow-button primary" data-action="open-sort" data-start-mode="resume" data-job-id="${job.id}" type="button">${primaryStartLabel}</button>
            <button class="imageflow-button" data-action="open-sort" data-start-mode="begin" data-job-id="${job.id}" title="${escapeAttr(beginStartHint(job))}" type="button">Von vorn ansehen</button>
            <button class="imageflow-button" data-action="open-sort" data-start-mode="unsorted" data-job-id="${job.id}" type="button">Offene Bilder</button>
            <button class="imageflow-button" data-action="edit-job" data-job-id="${job.id}" type="button">Bearbeiten</button>
            <button class="imageflow-button" data-action="duplicate-job" data-job-id="${job.id}" type="button">Duplizieren</button>
            <button class="imageflow-button" data-action="${paused ? "resume-job" : "pause-job"}" data-job-id="${job.id}" type="button">${paused ? "Fortsetzen" : "Pausieren"}</button>
            <button class="imageflow-button primary" data-action="queue-job" data-job-id="${job.id}" type="button">Ablage prüfen</button>
            ${canProcessNow ? `<button class="imageflow-button" data-action="process-job-now-direct" data-job-id="${job.id}" type="button">Jetzt ausführen</button>` : ""}
            ${debugUi ? `<button class="imageflow-button" data-action="show-job-log" data-job-id="${job.id}" type="button">Ereignisse</button>` : ""}
            <button class="imageflow-button danger" data-action="discard-job" data-job-id="${job.id}" type="button">Flow verwerfen</button>
          </div>
        </td>
      </tr>
    `;
  }

  function renderJobLastStatus(job) {
    const latest = job.lastRunStatus || null;
    if (!latest || !latest.message) {
      return "";
    }
    return `
      <div class="imageflow-run-status">
        <strong>${escapeHtml(formatShortTime(latest.createdAt))}</strong>
        <span>${escapeHtml(latest.message)}</span>
      </div>
    `;
  }

  function renderSortPage() {
    const sortState = state.sortState || mockSortState(state.jobId || 1);
    const job = sortState.job;
    const images = sortImages(sortState);
    const currentIndex = clampIndex(state.imageIndex, images);
    const current = images[currentIndex] || {
      name: "Kein Bild geladen",
      path: job.sourcePath || "/",
      mimeType: "",
    };
    const bufferPlan = planImageBuffer(images, currentIndex);
    const filmstrip = filmstripWindow(images, currentIndex);
    const preview = photoDisplayUrl(current);
    const page = sortState.imagePage || state.imagePage || defaultImagePage(images);
    const targetFolder = state.targetFolderPage;
    const isFolderMode = job.targetMode === "move" || job.targetMode === "copy";
    const progress = progressStats(job, page, images);
    const tempo = sessionTempo();
    const milestone = flowMilestone(progress.percent, state.decisionStreak);
    const beginHint = beginStartHint(job);
    const hasDecisions = Number(job.sortedFiles || 0) + Number(job.skippedFiles || 0) > 0 || (sortState.recentAssignments || []).length > 0;
    const decisionsForReview = Number(job.sortedFiles || 0) + Number(job.skippedFiles || 0) + Number(job.queuedOperations || 0);
    const sortingComplete = images.length === 0 && decisionsForReview > 0;
    const listedTargets = state.targets.length
      ? state.targets
      : (isFolderMode || state.targetQuery.trim() ? [] : mockTargets());
    const emptyTargetMessage = state.targetQuery.trim()
      ? `Kein Ziel passt zu "${state.targetQuery.trim()}".`
      : "Keine Ziele in diesem Ordner.";

    return `
      <section class="imageflow-sort" aria-label="Sortieransicht">
        <header class="imageflow-job-head">
          <div class="imageflow-head-title">
            <h3>${escapeHtml(job.name || "Flow")}</h3>
            <p>${escapeHtml(job.sourcePath || "/")} ${job.options?.recursiveSource ? "· mit Unterordnern" : ""} · ${modeLabel(job.targetMode)} · ${statusLabel(job.status)} · Bild ${images.length ? currentIndex + 1 : 0}/${images.length}</p>
          </div>
          <div class="imageflow-head-actions">
            <div class="imageflow-toolbar">
              <span class="imageflow-badge safe">${job.safeMode ? "Extra sicher" : "Standard"}</span>
              <span class="imageflow-badge">${Number(job.sortedFiles || 0)} entschieden</span>
              <span class="imageflow-badge">${Number(job.queuedOperations || 0)} ${jobQueueLabel(job)}</span>
              <button class="imageflow-button" data-action="undo-last-decision" type="button" ${hasDecisions ? "" : "disabled"}>Rückgängig</button>
              <button class="imageflow-button primary" data-action="queue-job" data-job-id="${escapeAttr(job.id || state.jobId || "")}" type="button" ${decisionsForReview > 0 ? "" : "disabled"}>Ablage prüfen</button>
              <button class="imageflow-button" data-action="start-sort" data-start-mode="resume" type="button">Weitermachen</button>
              <button class="imageflow-button" data-action="start-sort" data-start-mode="begin" title="${escapeAttr(beginHint)}" type="button">Von vorn ansehen</button>
              <button class="imageflow-button" data-action="start-sort" data-start-mode="unsorted" type="button">Offene Bilder</button>
              <button class="imageflow-button" data-action="go-jobs" type="button">Zurück</button>
            </div>
            <section class="imageflow-gamebar" aria-label="Flow-Fortschritt">
              <div class="imageflow-flow-meter">
                <div class="imageflow-flow-meter-head">
                  <strong>${progress.done}/${progress.total} entschieden</strong>
                  <span>${progress.percent}%</span>
                </div>
                <div class="imageflow-progress-track" aria-hidden="true">
                  <span class="imageflow-progress-fill" style="width: ${progress.percent}%"></span>
                </div>
              </div>
              <div class="imageflow-flow-chip accent-warm">
                <strong>${state.decisionStreak}</strong>
                <span>Serie</span>
              </div>
              <div class="imageflow-flow-chip accent-cool">
                <strong>${state.decisionsThisSession}</strong>
                <span>Dieser Flow</span>
              </div>
              <div class="imageflow-flow-chip accent-violet">
                <strong>${tempo}</strong>
                <span>Bilder/min</span>
              </div>
              <div class="imageflow-flow-chip accent-cool">
                <strong>${bufferPlan.length}</strong>
                <span>Vorgeladen</span>
              </div>
              <div class="imageflow-flow-milestone">${escapeHtml(milestone)}</div>
            </section>
          </div>
        </header>
        <div class="imageflow-sort-grid">
          <aside class="imageflow-rail">
            <h4>Schnellziele</h4>
            <div class="imageflow-favorite-list">
              ${(sortState.favorites || []).map((favorite) => renderFavorite(favorite, current)).join("")}
            </div>
          </aside>
          <section class="imageflow-photo-stage">
            <div class="imageflow-photo">
              <div class="imageflow-photo-card ${state.feedback ? "is-celebrating" : ""}">
                ${sortingComplete ? `
                  <div class="imageflow-complete-panel" role="status">
                    <strong>Alle offenen Bilder sind entschieden.</strong>
                    <span>Als nächstes bitte die Ablage prüfen. Dort siehst du Warnungen, Doppelungen und gibst die Entscheidungen frei.</span>
                    <div class="imageflow-actions">
                      <button class="imageflow-button" data-action="go-jobs" type="button">Zur Übersicht</button>
                      <button class="imageflow-button primary" data-action="queue-job" data-job-id="${escapeAttr(job.id || state.jobId || "")}" type="button">Ablage prüfen</button>
                    </div>
                  </div>
                ` : `
                  ${preview ? `<img class="imageflow-photo-img" src="${escapeAttr(preview)}" alt="${escapeAttr(current.name || "Bild")}" decoding="async" fetchpriority="high" draggable="false">` : '<div class="imageflow-photo-icon" aria-hidden="true"></div>'}
                  <div class="imageflow-photo-meta">
                    <strong>${escapeHtml(current.name || "Bild")}</strong>
                    <span>${escapeHtml(current.path || "")}</span>
                  </div>
                `}
                ${renderFeedbackBurst()}
              </div>
            </div>
            <div class="imageflow-hotkeys">
              <span class="imageflow-hotkey"><b>${escapeHtml(hotkeySummaryLabel(job.options || {}))}</b> Schnellziel</span>
              <span class="imageflow-hotkey"><b>0</b> Überspringen</span>
              <span class="imageflow-hotkey"><b>Leertaste</b> Überspringen</span>
              <span class="imageflow-hotkey"><b>Strg+Z</b> Rückgängig</span>
              <span class="imageflow-hotkey"><b>←/→</b> Vorschaubilder</span>
            </div>
          </section>
          <aside class="imageflow-targets">
            <div class="imageflow-panel-head">
              <div>
                <h4>Alle Ziele</h4>
                <p>${job.targetMode === "album" ? targetOrderingLabel(job.options?.targetOrdering) : escapeHtml(targetFolder?.current?.path || state.targetBrowsePath || "/")}</p>
              </div>
              <div class="imageflow-target-head-actions">
                <button class="imageflow-button primary" data-action="focus-target-create" type="button">${job.targetMode === "album" ? "Album anlegen" : "Ordner anlegen"}</button>
                ${isFolderMode ? `<button class="imageflow-button" data-action="browse-target-parent" type="button" ${targetFolder?.parent ? "" : "disabled"}>Eine Ebene hoch</button>` : ""}
              </div>
            </div>
            ${renderTargetSearch(isFolderMode)}
            ${renderTargetCreate(job, isFolderMode, targetFolder)}
            <div class="imageflow-target-list">
              ${listedTargets.map((target, index) => renderTarget(target, current, index, isFolderMode)).join("") || `<div class="imageflow-empty">${escapeHtml(emptyTargetMessage)}</div>`}
            </div>
          </aside>
        </div>
        <footer class="imageflow-filmstrip" aria-label="Vorschauleiste">
          <button class="imageflow-icon-button imageflow-filmstrip-nav" data-action="page-prev" aria-label="Vorherige Vorschaubilder" title="Vorherige Vorschaubilder" type="button" ${page.hasPrevious ? "" : "disabled"}>&lsaquo;</button>
          <div class="imageflow-strip" role="listbox" aria-label="Vorgeladene Bilder">
            ${filmstrip.items.map((image, offset) => renderThumb(image, filmstrip.start + offset, currentIndex, bufferPlan)).join("") || '<div class="imageflow-empty">Keine Vorschaubilder geladen.</div>'}
          </div>
          <button class="imageflow-icon-button imageflow-filmstrip-nav" data-action="page-next" aria-label="Nächste Vorschaubilder" title="Nächste Vorschaubilder" type="button" ${page.hasNext ? "" : "disabled"}>&rsaquo;</button>
        </footer>
      </section>
    `;
  }

  function renderFavorite(favorite, current) {
    const isSkip = favorite.locked || favorite.targetType === "skip" || favorite.id === "skip";
    const favoriteId = String(favorite.id || "");
    const decisionDisabled = state.decisionInFlight ? "disabled" : "";
    const favoriteHotkey = favorite.hotkey || String(favorite.position || "");
    const favoriteTitle = [favorite.label, favorite.path ? normalizeDisplayPath(favorite.path) : "", favoriteHotkey ? `Taste ${favoriteHotkey}` : ""]
      .filter(Boolean)
      .join(" - ");
    const rowAttrs = isSkip
      ? ""
      : `draggable="true" data-favorite-id="${escapeAttr(favoriteId)}"`;
    const action = isSkip ? "skip-current" : "assign";
    const remove = isSkip
      ? '<span class="imageflow-mini-spacer" aria-hidden="true"></span>'
      : `<button class="imageflow-mini-button danger" data-action="remove-favorite" data-favorite-id="${escapeAttr(favoriteId)}" aria-label="Schnellziel entfernen: ${escapeAttr(favorite.label)}" title="Schnellziel entfernen" type="button">x</button>`;
    return `
      <div class="imageflow-favorite-row ${isSkip ? "is-fixed" : ""}" ${rowAttrs}>
        <span class="imageflow-drag-handle" aria-hidden="true">::</span>
        <button class="imageflow-favorite" data-action="${action}" data-file-id="${escapeAttr(current.fileId || "")}" data-file-name="${escapeAttr(current.name || "")}" data-mime-type="${escapeAttr(current.mimeType || "")}" data-source-path="${escapeAttr(current.path || "")}" data-target-id="${escapeAttr(favorite.targetId || favorite.id || "")}" data-target-label="${escapeAttr(favorite.label)}" data-target-path="${escapeAttr(favorite.path || "")}" data-hotkey="${escapeAttr(favorite.hotkey || "")}" title="${escapeAttr(favoriteTitle)}" type="button" ${decisionDisabled}>
          <span class="imageflow-key">${escapeHtml(favoriteHotkey)}</span>
          <span><strong>${escapeHtml(favorite.label)}</strong></span>
        </button>
        ${remove}
      </div>
    `;
  }

  function renderTarget(target, current, index, isFolderMode = false) {
    const label = target.label || target.name || "Ziel";
    const targetId = target.id || target.path || "";
    const targetPath = target.path || "";
    const targetMeta = target.location || target.path || "";
    const targetTitle = [label, targetMeta].filter(Boolean).join(" - ");
    const decisionDisabled = state.decisionInFlight ? "disabled" : "";
    const browse = isFolderMode && target.hasChildren
      ? `<button class="imageflow-mini-button" data-action="browse-target-folder" data-target-path="${escapeAttr(targetPath)}" aria-label="Ordner öffnen: ${escapeAttr(label)}" title="Ordner öffnen" type="button">›</button>`
      : "";
    return `
      <div class="imageflow-target-row">
        <button class="imageflow-target" data-action="assign" data-file-id="${escapeAttr(current.fileId || "")}" data-file-name="${escapeAttr(current.name || "")}" data-mime-type="${escapeAttr(current.mimeType || "")}" data-source-path="${escapeAttr(current.path || "")}" data-target-id="${escapeAttr(targetId)}" data-target-label="${escapeAttr(label)}" data-target-path="${escapeAttr(targetPath)}" title="${escapeAttr(targetTitle)}" type="button" ${decisionDisabled}>
          <span class="imageflow-key">${index + 1}</span>
          <span><strong>${escapeHtml(label)}</strong><small>${escapeHtml(targetMeta)}</small></span>
        </button>
        ${browse}
        <button class="imageflow-mini-button" data-action="add-favorite" data-target-id="${escapeAttr(targetId)}" data-target-label="${escapeAttr(label)}" data-target-path="${escapeAttr(targetPath)}" aria-label="Als Schnellziel merken: ${escapeAttr(label)}" title="Als Schnellziel merken" type="button">+</button>
      </div>
    `;
  }

  function renderTargetSearch(isFolderMode) {
    const placeholder = isFolderMode ? "Ordner suchen" : "Album suchen";
    const note = isFolderMode ? "Sucht im geöffneten Ordner und seinen Unterordnern." : "Sucht in deinen Nextcloud-Alben.";
    return `
      <div class="imageflow-target-filter">
        <label for="ifl-target-query">Ziel suchen</label>
        <div>
          <input id="ifl-target-query" data-target-query type="search" maxlength="120" value="${escapeAttr(state.targetQuery)}" placeholder="${escapeAttr(placeholder)}" autocomplete="off">
          <button class="imageflow-mini-button" data-action="clear-target-search" aria-label="Suche leeren" title="Suche leeren" type="button" ${state.targetQuery.trim() ? "" : "disabled"}>x</button>
        </div>
        <small>${escapeHtml(note)}</small>
      </div>
    `;
  }

  function renderTargetCreate(job, isFolderMode, targetFolder) {
    if (!state.targetCreateOpen) {
      return "";
    }
    const parentPathValue = targetFolder?.current?.path || state.targetBrowsePath || job.targetPath || "/";
    const title = job.targetMode === "album" ? "Album anlegen" : "Ordner anlegen";
    const placeholder = job.targetMode === "album" ? "Neues Album" : "Neuer Ordner";
    const note = job.targetMode === "album"
      ? "Erscheint sofort in den Zielen und kann als Schnellziel gemerkt werden."
      : `Wird in ${parentPathValue} angelegt.`;
    return `
      <div class="imageflow-target-create">
        <label for="ifl-target-create">${escapeHtml(title)}</label>
        <div>
          <input id="ifl-target-create" data-target-create-name type="text" maxlength="255" value="${escapeAttr(state.targetCreateName || "")}" placeholder="${escapeAttr(placeholder)}" ${state.targetCreateBusy ? "disabled" : ""}>
          <button class="imageflow-button primary" data-action="create-target" type="button" ${state.targetCreateBusy ? "disabled" : ""}>${state.targetCreateBusy ? "Wird angelegt" : "Anlegen"}</button>
        </div>
        <small>${escapeHtml(note)}</small>
      </div>
    `;
  }

  function renderFeedbackBurst() {
    const feedback = state.feedback;
    if (!feedback) {
      return "";
    }

    const title = feedback.type === "skip" ? "Übersprungen" : (feedback.type === "duplicate" ? "Schon vorgemerkt" : "+1");
    const label = feedback.label ? feedback.label : "gespeichert";
    return `
      <div class="imageflow-feedback-burst ${feedback.type === "skip" ? "skip" : ""}" role="status">
        <strong>${escapeHtml(title)}</strong>
        <span>${escapeHtml(label)}</span>
        <small>${Number(feedback.streak || 0)}er Serie</small>
      </div>
    `;
  }

  function renderThumb(image, index, currentIndex, bufferPlan) {
    const active = index === currentIndex;
    const buffered = bufferPlan.includes(index);
    const preview = image?.thumbnailUrl || imageUrl(image);
    return `
      <button class="imageflow-thumb ${active ? "is-active" : ""} ${buffered ? "is-buffered" : ""}" data-action="select-image" data-index="${index}" role="option" aria-label="${escapeAttr(image.name || "Bild")}" aria-selected="${active ? "true" : "false"}" type="button">
        ${preview ? `<img class="imageflow-thumb-img" src="${escapeAttr(preview)}" alt="" loading="lazy" decoding="async" draggable="false">` : ""}
        <strong>${escapeHtml(image.name || "Bild")}</strong>
        <span>${escapeHtml(image.mimeType || "")}</span>
      </button>
    `;
  }

  function renderFolderPicker() {
    if (!state.folderPicker.open) {
      return "";
    }
    const picker = state.folderPicker;
    const fallback = {
      current: { name: "Dateien", path: picker.path || "/" },
      parent: parentPath(picker.path || "/"),
      folders: [],
      imageCount: 0,
    };
    const data = picker.data || (hasNextcloud ? fallback : mockFolderPage(picker.path || "/"));
    const currentPath = data.current?.path || picker.path || "/";
    const title = picker.field === "targetPath" ? "Zielordner wählen" : "Bilderordner wählen";
    return `
      <div class="imageflow-modal-backdrop" role="presentation">
        <section class="imageflow-modal" role="dialog" aria-modal="true" aria-label="${escapeAttr(title)}">
          <header class="imageflow-modal-head">
            <div>
              <h3>${escapeHtml(title)}</h3>
              <p>${escapeHtml(currentPath)} · ${Number(data.imageCount || 0)} Bilder direkt in diesem Ordner</p>
            </div>
            <button class="imageflow-icon-button" data-action="close-folder-picker" type="button">Schließen</button>
          </header>
          <div class="imageflow-folder-actions">
            <button class="imageflow-button" data-action="folder-picker-parent" type="button" ${data.parent ? "" : "disabled"}>Eine Ebene hoch</button>
            <button class="imageflow-button primary" data-action="choose-folder" data-folder-path="${escapeAttr(currentPath)}" type="button" ${picker.loading ? "disabled" : ""}>Diesen Ordner wählen</button>
          </div>
          ${picker.error ? `<div class="imageflow-empty">${escapeHtml(picker.error)}</div>` : ""}
          <div class="imageflow-folder-list">
            ${picker.loading && hasNextcloud ? '<div class="imageflow-empty">Ordner werden geladen.</div>' : ((data.folders || []).map(renderFolderPickerRow).join("") || '<div class="imageflow-empty">Keine Unterordner vorhanden.</div>')}
          </div>
        </section>
      </div>
    `;
  }

  function renderFolderPickerRow(folder) {
    return `
      <div class="imageflow-folder-row">
        <button class="imageflow-folder-main" data-action="folder-picker-open" data-folder-path="${escapeAttr(folder.path)}" type="button">
          <strong>${escapeHtml(folder.name)}</strong>
          <span>${escapeHtml(folder.path)}${folder.hasChildren ? " · Unterordner" : ""}</span>
        </button>
        <button class="imageflow-button" data-action="choose-folder" data-folder-path="${escapeAttr(folder.path)}" type="button">Wählen</button>
      </div>
    `;
  }

  function renderWorklistPreview() {
    if (!state.worklist.open) {
      return "";
    }
    const preview = state.worklist.preview;
    const summary = preview?.summary || {};
    const items = preview?.items || [];
    const filteredItems = filteredWorklistItems(items, state.worklist.filter);
    const windowInfo = preview?.window || { total: Number(summary.total || items.length), shown: items.length, truncated: false };
    const plannedCount = Number(summary.planned || 0);
    const queuedCount = Number(summary.queued || 0) + Number(summary.executing || 0);
    const worklistHasErrors = Number(summary.errors || 0) > 0;
    const canSaveQueueSettings = queuedCount > 0 && !preview?.canQueue;
    const queueButtonEnabled = Boolean(preview?.canQueue || canSaveQueueSettings);
    const queueButtonLabel = canSaveQueueSettings
      ? "Einstellung merken"
      : (preview?.executionMode === "real-writes-enabled" ? "Zur Ausführung freigeben" : "Für später vormerken");
    return `
      <div class="imageflow-modal-backdrop" role="presentation">
        <section class="imageflow-modal imageflow-worklist-modal" role="dialog" aria-modal="true" aria-label="Ablage prüfen">
          <header class="imageflow-modal-head">
            <div>
              <h3>Ablage prüfen</h3>
              <p>${escapeHtml(preview?.job?.name || "Flow")} | ${modeLabel(preview?.job?.targetMode || "")}</p>
            </div>
            ${preview ? `<span class="imageflow-badge ${executionModeClass(preview.executionMode)}">${executionModeLabel(preview.executionMode)}</span>` : ""}
            ${preview ? `<span class="imageflow-badge ${backgroundModeClass(preview.backgroundMode)}">${backgroundModeLabel(preview.backgroundMode)}</span>` : ""}
            <button class="imageflow-icon-button" data-action="close-worklist-preview" type="button">Schließen</button>
          </header>
          ${state.worklist.loading ? '<div class="imageflow-empty">Ablage wird geprüft.</div>' : ""}
          ${state.worklist.error ? `<div class="imageflow-empty">${escapeHtml(state.worklist.error)}</div>` : ""}
          ${preview ? `
            <div class="imageflow-worklist-body">
            <div class="imageflow-status-grid">
              <div class="imageflow-stat"><strong>${Number(summary.total || 0)}</strong><span>Entscheidungen</span></div>
              <div class="imageflow-stat"><strong>${plannedCount}</strong><span>Wartet auf Freigabe</span></div>
              <div class="imageflow-stat"><strong>${queuedCount}</strong><span>Ausführbar</span></div>
              <div class="imageflow-stat"><strong>${Number(summary.warnings || 0)}</strong><span>Warnungen</span></div>
              <div class="imageflow-stat"><strong>${Number(summary.errors || 0)}</strong><span>Fehler</span></div>
              <div class="imageflow-stat"><strong>${Number(summary.executed || 0)}</strong><span>Erledigt</span></div>
              <div class="imageflow-stat"><strong>${Number(summary.blocked || 0) + Number(summary.failed || 0)}</strong><span>Blockiert</span></div>
            </div>
            <div class="imageflow-worklist-note">
              <span>${escapeHtml(preview.message || "")}</span>
              ${renderWorklistWindowNote(windowInfo)}
              ${renderBackgroundGateNote(preview)}
            </div>
            ${renderWorklistNextStep(preview, plannedCount, queuedCount, worklistHasErrors)}
            ${renderWorklistActions(preview, queueButtonEnabled, queueButtonLabel, queuedCount, worklistHasErrors)}
            ${renderWorklistRepairPanel(preview, items, worklistHasErrors)}
            ${renderWorklistFilters(items, windowInfo)}
            <label class="imageflow-toggle imageflow-worklist-toggle">
              <input id="ifl-worklist-auto" data-action="toggle-worklist-auto" type="checkbox" ${state.worklist.autoProcess ? "checked" : ""}>
              Automatisch ablegen, wenn der Server ruhig ist
            </label>
            <div class="imageflow-worklist-table">
              ${filteredItems.map(renderWorklistItem).join("") || `<div class="imageflow-empty">${escapeHtml(worklistEmptyLabel(state.worklist.filter, items.length))}</div>`}
            </div>
            ${renderWorklistLogs(preview.logs || [])}
            </div>
          ` : ""}
        </section>
      </div>
    `;
  }

  function renderWorklistLogs(logs) {
    const entries = Array.isArray(logs) ? logs.slice(0, 80) : [];
    return `
      <section class="imageflow-worklist-logs" aria-label="Ablage-Protokoll">
        <div class="imageflow-panel-head">
          <div>
            <h4>Ablage-Protokoll</h4>
            <p>Die letzten Diagnoseereignisse zu diesem Flow. Pfade und Prüfdaten stehen im Kontext.</p>
          </div>
          <button class="imageflow-button" data-action="export-diagnostics-anonymized" type="button">Anonymisierten Supportexport laden</button>
        </div>
        <div class="imageflow-log-list compact">
          ${entries.map(renderLogRow).join("") || '<div class="imageflow-empty">Noch keine Protokolleinträge für diesen Flow.</div>'}
        </div>
      </section>
    `;
  }

  function renderWorklistNextStep(preview, plannedCount, queuedCount, hasErrors) {
    let message = "Keine Aktion nötig.";
    if (hasErrors) {
      message = "Erst die Fehler beheben. Danach kann die Ablage freigegeben werden.";
    } else if (plannedCount > 0 && preview?.executionMode === "real-writes-enabled") {
      message = `Nächster Schritt: ${plannedCount} Entscheidungen zur Ausführung freigeben. Danach kannst du manuell starten oder die Automatik arbeiten lassen.`;
    } else if (plannedCount > 0) {
      message = `Nächster Schritt: ${plannedCount} Entscheidungen sicher für später vormerken. Dateien werden dabei nicht verändert.`;
    } else if (queuedCount > 0 && preview?.executionMode === "real-writes-enabled") {
      message = `${queuedCount} Ablagen sind ausführbar. Du kannst jetzt manuell starten oder die Automatik laufen lassen.`;
    } else if (queuedCount > 0) {
      message = `${queuedCount} Ablagen warten. Echte Dateiänderungen sind noch serverseitig gesperrt.`;
    }

    return `<div class="imageflow-worklist-next-step">${escapeHtml(message)}</div>`;
  }

  function renderWorklistActions(preview, queueButtonEnabled, queueButtonLabel, queuedCount, hasErrors) {
    const processEnabled = preview?.executionMode === "real-writes-enabled" && queuedCount > 0 && !hasErrors;
    return `
      <div class="imageflow-worklist-actions" aria-label="Ablage Aktionen">
        <button class="imageflow-button" data-action="refresh-worklist-preview" type="button">Erneut prüfen</button>
        ${hasErrors ? `<button class="imageflow-button danger" data-action="toggle-worklist-repair" aria-expanded="${state.worklist.repairOpen ? "true" : "false"}" type="button">Fehler beheben</button>` : ""}
        <button class="imageflow-button primary" data-action="confirm-queue-job" data-job-id="${escapeAttr(state.worklist.jobId || "")}" type="button" ${queueButtonEnabled ? "" : "disabled"}>${queueButtonLabel}</button>
        <button class="imageflow-button" data-action="process-job-now" data-job-id="${escapeAttr(state.worklist.jobId || "")}" type="button" ${processEnabled ? "" : "disabled"}>Jetzt ausführen</button>
      </div>
    `;
  }

  function renderWorklistRepairPanel(preview, items, hasErrors) {
    if (!state.worklist.repairOpen) {
      return "";
    }
    const repairItems = worklistErrorItems(items);
    const resettableItems = repairItems.filter(isResettableWorklistItem);
    const renameableItems = repairItems.filter(isAutoRenameableWorklistItem);
    const jobId = preview?.job?.id || state.worklist.jobId || "";
    return `
      <section class="imageflow-worklist-repair" aria-label="Fehler beheben">
        <div class="imageflow-panel-head">
          <div>
            <h4>Fehlerbehebung</h4>
            <p>Diese Werkzeuge ändern nur noch nicht ausgeführte Ablagepunkte. Laufende oder bereits erledigte Ablagen bleiben unverändert.</p>
          </div>
          <div class="imageflow-actions">
            <button class="imageflow-button" data-action="refresh-worklist-preview" type="button">Fehler erneut prüfen</button>
            ${renameableItems.length ? `<button class="imageflow-button primary" data-action="repair-auto-rename-visible-conflicts" data-job-id="${escapeAttr(jobId)}" type="button">Alle Zielkonflikte umbenennen</button>` : ""}
            ${resettableItems.length ? `<button class="imageflow-button danger" data-action="repair-reset-visible-errors" data-job-id="${escapeAttr(jobId)}" type="button">Alle Fehler zurücksetzen</button>` : ""}
            ${resettableItems.length ? `<button class="imageflow-button" data-action="repair-reset-visible-errors-and-sort" data-job-id="${escapeAttr(jobId)}" type="button">Alle zurücksetzen & offene Bilder</button>` : ""}
            <button class="imageflow-button" data-action="repair-go-sort" data-job-id="${escapeAttr(jobId)}" type="button">Offene Bilder zeigen</button>
          </div>
        </div>
        <div class="imageflow-repair-list">
          ${repairItems.map(renderWorklistRepairItem).join("") || `<div class="imageflow-empty">${escapeHtml(hasErrors ? "Kein direkt behebbarer Fehler in den sichtbaren Einträgen. Prüfe die Ablage erneut oder öffne das Protokoll." : "Keine Aktion nötig.")}</div>`}
        </div>
      </section>
    `;
  }

  function worklistErrorItems(items) {
    return (Array.isArray(items) ? items : []).filter((item) => item.readiness === "error" || ["blocked", "failed"].includes(item.status || ""));
  }

  function renderWorklistRepairItem(item) {
    const issues = normalizedWorklistIssues(item);
    const primaryIssue = issues.find((issue) => issue.action === "auto_rename_target" || issue.code === "target_file_exists")
      || issues.find((issue) => issue.severity === "error")
      || issues[0]
      || {};
    const canReset = isResettableWorklistItem(item);
    const canAutoRename = isAutoRenameableWorklistItem(item);
    const canCreateFolder = canRepairCreateTargetFolder(item, issues);
    const jobId = state.worklist.jobId || state.worklist.preview?.job?.id || "";
    const targetPath = item.targetPath || "";
    const targetFileName = item.targetFileName || "";
    return `
      <article class="imageflow-repair-row">
        <div class="imageflow-repair-main">
          <span class="imageflow-badge danger">${escapeHtml(worklistIssueTitle(primaryIssue))}</span>
          <strong>${escapeHtml(item.sourcePath || "")}</strong>
          <small>${escapeHtml(targetPath || item.targetAlbumId || "")}</small>
          ${targetFileName ? `<small>${escapeHtml(`Zielname: ${targetFileName}`)}</small>` : ""}
          <p>${escapeHtml(worklistIssueSuggestion(primaryIssue, item))}</p>
          <ul>
            ${issues.map((issue) => `<li>${escapeHtml(issue.message || "")}</li>`).join("")}
          </ul>
        </div>
        <div class="imageflow-repair-actions">
          ${canCreateFolder ? `<button class="imageflow-button primary" data-action="repair-create-target-folder" data-job-id="${escapeAttr(jobId)}" data-target-path="${escapeAttr(targetPath)}" data-operation-type="${escapeAttr(item.operationType || "")}" type="button">Zielordner anlegen</button>` : ""}
          ${canAutoRename ? `<button class="imageflow-button primary" data-action="repair-auto-rename-item" data-job-id="${escapeAttr(jobId)}" data-queue-item-id="${escapeAttr(item.id || "")}" type="button">Mit neuem Namen ablegen</button>` : ""}
          ${canReset ? `<button class="imageflow-button danger" data-action="repair-reset-item" data-job-id="${escapeAttr(jobId)}" data-queue-item-id="${escapeAttr(item.id || "")}" type="button">Aus Stapel entfernen</button>` : ""}
          ${canReset ? `<button class="imageflow-button" data-action="repair-reset-item-and-sort" data-job-id="${escapeAttr(jobId)}" data-queue-item-id="${escapeAttr(item.id || "")}" type="button">Entfernen & offene Bilder</button>` : ""}
        </div>
      </article>
    `;
  }

  function isResettableWorklistItem(item) {
    return ["planned", "queued", "blocked", "failed"].includes(item?.status || "") && Boolean(item?.id);
  }

  function isAutoRenameableWorklistItem(item) {
    if (!isResettableWorklistItem(item) || !["copy", "move"].includes(item?.operationType || "") || !item?.targetPath) {
      return false;
    }
    return normalizedWorklistIssues(item).some((issue) => issue.code === "target_file_exists" || issue.action === "auto_rename_target");
  }

  function normalizedWorklistIssues(item) {
    if (Array.isArray(item?.issues) && item.issues.length) {
      return item.issues;
    }
    return (item?.messages || []).map((message) => ({
      code: item?.readiness === "error" ? "unknown_error" : "unknown_warning",
      severity: item?.readiness === "error" ? "error" : "warning",
      message,
      action: item?.readiness === "error" ? "remove_and_resort" : "review",
    }));
  }

  function canRepairCreateTargetFolder(item, issues) {
    if (!["copy", "move"].includes(item?.operationType || "") || !item?.targetPath) {
      return false;
    }
    if (!["planned", "queued"].includes(item.status || "")) {
      return false;
    }
    return issues.some((issue) => issue.code === "target_folder_missing" || issue.action === "create_target_folder");
  }

  function worklistIssueTitle(issue) {
    return {
      target_folder_missing: "Fehlender Zielordner",
      target_file_exists: "Zielkonflikt",
      source_missing: "Fehlerhafte Entscheidung",
      duplicate_move_source: "Fehlerhafte Entscheidung",
      duplicate_operation: "Fehlerhafte Entscheidung",
      unknown_operation: "Fehlerhafte Entscheidung",
    }[issue?.code] || (issue?.severity === "warning" ? "Sicherer Vorschlag" : "Fehlerhafte Entscheidung");
  }

  function worklistIssueSuggestion(issue, item) {
    if (issue?.action === "create_target_folder") {
      return "Ordner anlegen oder den Eintrag aus dem Stapel entfernen.";
    }
    if (issue?.action === "auto_rename_target" || issue?.code === "target_file_exists") {
      return "Wähle einen freien Zielnamen oder entferne diesen Ablagepunkt aus dem Stapel.";
    }
    if (issue?.action === "review_log_and_resort" || ["blocked", "failed"].includes(item?.status || "")) {
      return "Im Protokoll prüfen und danach neu sortieren.";
    }
    if (["remove_duplicate_decision", "remove_and_resort"].includes(issue?.action || "")) {
      return "Aus Stapel entfernen und das Bild danach neu sortieren.";
    }
    return "Noch einmal prüfen.";
  }

  function renderBackgroundGateNote(preview) {
    if (!preview || preview.backgroundMode === "manual-only" || !preview.backgroundGate) {
      return "";
    }
    return `<span>${escapeHtml(preview.backgroundGate.message || "Automatik wartet auf ein ruhiges Serverfenster.")}</span>`;
  }

  function renderWorklistWindowNote(windowInfo) {
    const total = Number(windowInfo?.total || 0);
    const shown = Number(windowInfo?.shown || 0);
    if (!total) {
      return "";
    }
    if (windowInfo?.truncated) {
      return `<span>${total} geprüft, ${shown} wichtige Einträge angezeigt. Die Summen und Fehlerprüfung gelten für die komplette Ablage.</span>`;
    }
    return `<span>${total} geprüft, ${shown} angezeigt.</span>`;
  }

  function renderWorklistFilters(items, windowInfo) {
    if (!items.length) {
      return "";
    }
    const filters = [
      { id: "all", label: "Alle", count: items.length },
      { id: "issues", label: "Auffälligkeiten", count: items.filter(isWorklistIssue).length },
      { id: "ready", label: "Bereit", count: items.filter((item) => item.readiness === "ready").length },
      { id: "waiting", label: "Offen", count: items.filter((item) => ["planned", "queued", "executing"].includes(item.status || "")).length },
      { id: "done", label: "Erledigt", count: items.filter((item) => item.status === "executed").length },
    ];
    const visibleLabel = windowInfo?.truncated
      ? `${Number(windowInfo.shown || items.length)} sichtbar von ${Number(windowInfo.total || items.length)}`
      : `${items.length} sichtbar`;
    return `
      <div class="imageflow-worklist-filter" aria-label="Ablagefilter">
        <div class="imageflow-worklist-filter-buttons">
          ${filters.map((filter) => `
            <button class="imageflow-filter-chip ${state.worklist.filter === filter.id ? "is-active" : ""}" data-action="filter-worklist" data-worklist-filter="${escapeAttr(filter.id)}" type="button">${escapeHtml(filter.label)} <span>${filter.count}</span></button>
          `).join("")}
        </div>
        <span>${escapeHtml(visibleLabel)}</span>
      </div>
    `;
  }

  function filteredWorklistItems(items, filter) {
    if (filter === "issues") {
      return items.filter(isWorklistIssue);
    }
    if (filter === "ready") {
      return items.filter((item) => item.readiness === "ready");
    }
    if (filter === "waiting") {
      return items.filter((item) => ["planned", "queued", "executing"].includes(item.status || ""));
    }
    if (filter === "done") {
      return items.filter((item) => item.status === "executed");
    }
    return items;
  }

  function isWorklistIssue(item) {
    return item.readiness === "warning" || item.readiness === "error" || ["blocked", "failed"].includes(item.status || "");
  }

  function worklistEmptyLabel(filter, totalItems) {
    if (!totalItems) {
      return "Noch keine Entscheidungen für die Ablage vorhanden.";
    }
    return "Keine Einträge in diesem Filter.";
  }

  function renderWorklistItem(item) {
    const badgeClass = item.readiness === "error" ? "danger" : item.readiness === "warning" ? "ready" : "safe";
    const canRemove = ["planned", "queued", "blocked", "failed"].includes(item.status || "");
    const jobId = state.worklist.jobId || state.worklist.preview?.job?.id || "";
    const targetFileName = item.targetFileName || "";
    return `
      <div class="imageflow-worklist-row">
        <div>
          <strong>${escapeHtml(modeLabel(item.operationType))}</strong>
          <span>${escapeHtml(item.sourcePath || "")}</span>
          <small>${escapeHtml(item.targetPath || item.targetAlbumId || "")}</small>
          ${targetFileName ? `<small>${escapeHtml(`Zielname: ${targetFileName}`)}</small>` : ""}
          <small>${escapeHtml(queueStatusLabel(item.status))}${item.safeMode ? " | Prüfsummen" : ""}</small>
        </div>
        <div class="imageflow-worklist-item-actions">
          <span class="imageflow-badge ${badgeClass}">${readinessLabel(item.readiness)}</span>
          ${canRemove ? `<button class="imageflow-mini-button danger" data-action="remove-worklist-item" data-job-id="${escapeAttr(jobId)}" data-queue-item-id="${escapeAttr(item.id || "")}" aria-label="Ablage entfernen: ${escapeAttr(item.sourcePath || "")}" title="Ablage entfernen" type="button">x</button>` : ""}
        </div>
        <p>${(item.messages || []).map(escapeHtml).join(" ")}</p>
      </div>
    `;
  }

  function renderLogsPage() {
    const logs = state.logs.items || [];
    const filteredJob = state.logs.jobId ? state.jobs.find((job) => job.id === state.logs.jobId) : null;
    const diagnostics = state.logs.diagnostics || {};
    return `
      <section class="imageflow-log-page" aria-label="Protokoll">
        <div class="imageflow-panel">
          <div class="imageflow-panel-head">
            <div>
              <h3>Protokoll</h3>
              <p>${filteredJob ? `Nur ${escapeHtml(filteredJob.name || `Flow ${state.logs.jobId}`)}` : "Sicherheits- und Sortierereignisse für deine Flows."}</p>
            </div>
            <div class="imageflow-actions">
              <select class="imageflow-select-compact" data-action="change-log-level" aria-label="Log-Level">
                <option value="" ${state.logs.level === "" ? "selected" : ""}>Alle Level</option>
                <option value="debug" ${state.logs.level === "debug" ? "selected" : ""}>Debug</option>
                <option value="info" ${state.logs.level === "info" ? "selected" : ""}>Info</option>
                <option value="warning" ${state.logs.level === "warning" ? "selected" : ""}>Warnung</option>
                <option value="error" ${state.logs.level === "error" ? "selected" : ""}>Fehler</option>
              </select>
              ${state.logs.jobId ? '<button class="imageflow-button" data-action="show-log" type="button">Alle Flows</button>' : ""}
              <button class="imageflow-button" data-action="refresh-logs" type="button">Neu laden</button>
              <button class="imageflow-button primary" data-action="export-diagnostics" type="button">Diagnose exportieren</button>
              <button class="imageflow-button" data-action="export-diagnostics-anonymized" type="button">Anonymisiert exportieren</button>
            </div>
          </div>
          ${diagnostics.version ? `
            <div class="imageflow-diagnostics-strip" aria-label="Diagnoseüberblick">
              <span>Version ${escapeHtml(diagnostics.version || "")}</span>
              <span>${diagnostics.realExecutionEnabled ? "Dateiänderungen aktiv" : "Dateiänderungen gesperrt"}</span>
              <span>${diagnostics.backgroundProcessingEnabled ? "Automatik vorbereitet" : "Automatik aus"}</span>
              <span>${escapeHtml(diagnostics.backgroundGate?.reason || "ready")}</span>
            </div>
          ` : ""}
          ${state.logs.loading ? '<div class="imageflow-empty">Protokoll wird geladen.</div>' : ""}
          ${state.logs.error ? `<div class="imageflow-empty">${escapeHtml(state.logs.error)}</div>` : ""}
          <div class="imageflow-log-list">
            ${logs.map(renderLogRow).join("") || '<div class="imageflow-empty">Noch keine Protokolleinträge vorhanden.</div>'}
          </div>
        </div>
      </section>
    `;
  }

  function renderSettingsPage() {
    const data = state.adminSettings.data || {};
    const settings = data.settings || {};
    const gate = data.backgroundGate || state.health?.backgroundGate || {};
    const settingsLoaded = Boolean(data.settings);
    const controlsDisabled = state.adminSettings.loading || !settingsLoaded || state.adminSettings.saving;
    const disabled = controlsDisabled ? "disabled" : "";
    return `
      <section class="imageflow-settings-page" aria-label="Betrieb">
        <form class="imageflow-panel accent-violet imageflow-settings-form" id="imageflow-settings-form">
          <div class="imageflow-panel-head">
            <div>
              <h3>Globale Betriebseinstellungen</h3>
              <p>Diese Werte gelten serverweit für alle ImageFlow-Benutzer und werden in der Nextcloud-App-Konfiguration gespeichert.</p>
            </div>
            <div class="imageflow-actions">
              <button class="imageflow-button" data-action="refresh-settings" type="button">Neu laden</button>
              <button class="imageflow-button" data-action="export-diagnostics-all" type="button">Alle Logs laden</button>
              <button class="imageflow-button" data-action="export-diagnostics" type="button">Diagnose exportieren</button>
              <button class="imageflow-button" data-action="export-diagnostics-all-anonymized" type="button">Anonymisierte Logs laden</button>
              <button class="imageflow-button primary" type="submit" ${disabled}>Speichern</button>
            </div>
          </div>
          ${state.adminSettings.loading ? '<div class="imageflow-empty">Betriebseinstellungen werden geladen.</div>' : ""}
          ${state.adminSettings.error ? `<div class="imageflow-empty">${escapeHtml(state.adminSettings.error)}</div>` : ""}
          <div class="imageflow-settings-grid">
            <label class="imageflow-toggle imageflow-settings-danger">
              <input name="realExecutionEnabled" type="checkbox" ${settings.realExecutionEnabled ? "checked" : ""} ${disabled}>
              Echte Dateiänderungen erlauben
            </label>
            <label class="imageflow-toggle">
              <input name="backgroundProcessingEnabled" type="checkbox" ${settings.backgroundProcessingEnabled ? "checked" : ""} ${disabled}>
              Automatisch im Hintergrund ablegen
            </label>
            <label class="imageflow-toggle">
              <input name="backgroundLowLoadOnly" type="checkbox" ${settings.backgroundLowLoadOnly !== false ? "checked" : ""} ${disabled}>
              Nur bei ruhigem Server laufen lassen
            </label>
            <div class="imageflow-field">
              <label for="ifl-max-load">Maximale Serverauslastung (%)</label>
              <input id="ifl-max-load" name="backgroundMaxLoadPercent" type="number" min="1" max="100" step="1" value="${escapeAttr(settings.backgroundMaxLoadPercent ?? gate.maxLoadPercent ?? 70)}" ${disabled}>
            </div>
            <label class="imageflow-toggle">
              <input name="quietHoursEnabled" type="checkbox" ${settings.quietHoursEnabled ? "checked" : ""} ${disabled}>
              Nur im Zeitfenster laufen
            </label>
            <div class="imageflow-settings-times">
              <div class="imageflow-field">
                <label for="ifl-quiet-start">Start</label>
                <input id="ifl-quiet-start" name="quietHoursStart" type="time" value="${escapeAttr(settings.quietHoursStart || "22:00")}" ${disabled}>
              </div>
              <div class="imageflow-field">
                <label for="ifl-quiet-end">Ende</label>
                <input id="ifl-quiet-end" name="quietHoursEnd" type="time" value="${escapeAttr(settings.quietHoursEnd || "06:00")}" ${disabled}>
              </div>
            </div>
          </div>
          <div class="imageflow-settings-gate">
            <strong>${escapeHtml(gate.message || "Automatikstatus wird nach dem Speichern neu geprüft.")}</strong>
            <span>${escapeHtml(gateLoadDetail(gate))}</span>
          </div>
        </form>
      </section>
    `;
  }

  function gateLoadDetail(gate) {
    const percent = gate.currentLoadPercent ?? "-";
    const maxPercent = gate.maxLoadPercent ?? "-";
    const load = gate.currentLoad1m ?? "-";
    const cpu = gate.cpuCount ?? "-";
    return `Auslastung ${percent}% / Grenze ${maxPercent}% · Load ${load} · CPU-Kerne ${cpu}`;
  }

  function renderLogRow(log) {
    return `
      <article class="imageflow-log-row">
        <span class="imageflow-badge ${log.level === "error" ? "danger" : log.level === "warning" ? "ready" : "safe"}">${escapeHtml(log.level || "info")}</span>
        <div>
          <strong>${escapeHtml(log.event || "event")}</strong>
          <span>${escapeHtml(log.message || "")}</span>
          <small>${formatTime(log.createdAt)}${log.jobId ? ` · Flow ${escapeHtml(String(log.jobId))}` : ""}</small>
          ${log.context ? `<code>${escapeHtml(JSON.stringify(log.context))}</code>` : ""}
        </div>
      </article>
    `;
  }

  function renderToast() {
    if (!state.toast) {
      return "";
    }
    return `<div class="imageflow-toast ${state.toast.type === "error" ? "error" : ""}" role="status">${escapeHtml(state.toast.message)}</div>`;
  }

  function bindActions() {
    const form = document.getElementById("imageflow-job-form");
    if (form) {
      form.addEventListener("submit", saveJob);
      form.addEventListener("input", updateJobDraft);
      form.addEventListener("change", updateJobDraft);
      const mode = document.getElementById("ifl-mode");
      mode?.addEventListener("change", toggleTargetPath);
      toggleTargetPath();
    }
    const settingsForm = document.getElementById("imageflow-settings-form");
    if (settingsForm) {
      settingsForm.addEventListener("submit", saveAdminSettings);
    }

    root.querySelectorAll("[data-action]").forEach((button) => {
      const eventName = ["SELECT", "INPUT"].includes(button.tagName) ? "change" : "click";
      button.addEventListener(eventName, handleAction);
    });
    const targetQueryInput = root.querySelector("[data-target-query]");
    if (targetQueryInput) {
      targetQueryInput.addEventListener("input", (event) => {
        state.targetQuery = event.currentTarget.value || "";
        searchTargetsSoon();
      });
      targetQueryInput.addEventListener("search", (event) => {
        state.targetQuery = event.currentTarget.value || "";
        searchTargetsSoon();
      });
      targetQueryInput.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          clearTargetSearch();
        }
      });
    }
    const targetCreateInput = root.querySelector("[data-target-create-name]");
    if (targetCreateInput) {
      targetCreateInput.addEventListener("input", (event) => {
        state.targetCreateName = event.currentTarget.value || "";
      });
      targetCreateInput.addEventListener("keydown", async (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          await createTargetFromInput();
        }
      });
    }
    bindFavoriteDragAndDrop();

    document.removeEventListener("keydown", handleHotkey);
    if (state.page === "sort") {
      document.addEventListener("keydown", handleHotkey);
    }
  }

  async function saveJob(event) {
    event.preventDefault();
    const form = event.currentTarget;
    readJobDraft(form);
    const intent = event.submitter?.dataset?.saveIntent || "save";
    const editingJobId = numberOrNull(state.jobDraft.editingJobId);
    const body = jobDraftPayload();

    try {
      const payload = editingJobId
        ? await request(`/api/v1/jobs/${editingJobId}`, { method: "PUT", body })
        : await request("/api/v1/jobs", { method: "POST", body });
      state.jobs = [payload.job, ...state.jobs.filter((job) => job.id !== payload.job.id)];
      state.toast = { type: "info", message: editingJobId ? "Flow wurde gespeichert." : "Flow wurde gespeichert und ist bereit." };
      resetJobDraft();
      if (intent === "open") {
        await openSort(payload.job.id, "resume");
        return;
      }
      render();
    } catch (error) {
      state.toast = { type: "error", message: error.message || "Flow konnte nicht gespeichert werden." };
      render();
    }
  }

  function jobDraftPayload() {
    return {
      name: state.jobDraft.name.trim(),
      sourcePath: state.jobDraft.sourcePath.trim() || "/",
      targetMode: state.jobDraft.targetMode,
      targetPath: state.jobDraft.targetPath.trim() || DEFAULT_TARGET_PATH,
      recursiveSource: state.jobDraft.recursiveSource,
      safeMode: state.jobDraft.safeMode,
      autoProcess: state.jobDraft.autoProcess,
      preloadMode: state.jobDraft.preloadMode,
      targetOrdering: state.jobDraft.targetOrdering,
      hotkeys: state.jobDraft.hotkeys,
      customHotkeys: normalizeCustomHotkeys(state.jobDraft.customHotkeys),
    };
  }

  function resetJobDraft() {
    state.jobDraft = {
      editingJobId: null,
      name: "",
      sourcePath: "/Photos",
      targetMode: "album",
      targetPath: DEFAULT_TARGET_PATH,
      recursiveSource: false,
      safeMode: true,
      autoProcess: false,
      preloadMode: "balanced",
      targetOrdering: "relevance",
      hotkeys: "number-row",
      customHotkeys: ["", "", "", "", "", "", "", "", ""],
    };
  }

  function toggleTargetPath() {
    const mode = document.getElementById("ifl-mode");
    const targetField = root.querySelector("[data-target-path-field]");
    if (mode && targetField) {
      targetField.hidden = mode.value === "album";
    }
  }

  function updateJobDraft(event) {
    const form = event.currentTarget.closest ? event.currentTarget.closest("form") : document.getElementById("imageflow-job-form");
    readJobDraft(form);
    if (event.target?.name === "targetMode") {
      toggleTargetPath();
    }
    if (event.target?.name === "hotkeys") {
      render();
    }
  }

  function readJobDraft(form = document.getElementById("imageflow-job-form")) {
    if (!form) {
      return;
    }
    state.jobDraft = {
      editingJobId: state.jobDraft.editingJobId,
      name: form.name?.value || "",
      sourcePath: form.sourcePath?.value || "/",
      targetMode: form.targetMode?.value || "album",
      targetPath: form.targetPath?.value || DEFAULT_TARGET_PATH,
      recursiveSource: Boolean(form.recursiveSource?.checked),
      safeMode: Boolean(form.safeMode?.checked),
      autoProcess: Boolean(form.autoProcess?.checked),
      preloadMode: form.preloadMode?.value || "balanced",
      targetOrdering: form.targetOrdering?.value || "relevance",
      hotkeys: form.hotkeys?.value || "number-row",
      customHotkeys: Array.from(form.querySelectorAll(".imageflow-hotkey-input")).map((input) => input.value || ""),
    };
  }

  async function handleAction(event) {
    const action = event.currentTarget.dataset.action;
    const jobId = numberOrNull(event.currentTarget.dataset.jobId);
    if (state.decisionInFlight && ["assign", "skip-current", "select-image", "page-next", "page-prev"].includes(action)) {
      event.preventDefault();
      return;
    }
    if (action === "refresh") {
      load();
    } else if (action === "focus-new-flow") {
      focusNewFlow();
    } else if (action === "go-jobs") {
      state.page = "jobs";
      state.sortState = null;
      state.imagePage = null;
      state.pageCursor = null;
      await load();
    } else if (action === "go-sort" && state.jobId) {
      await openSort(state.jobId, "resume");
    } else if (action === "open-sort" && jobId) {
      await openSort(jobId, event.currentTarget.dataset.startMode || "resume");
    } else if (action === "start-sort") {
      await restartSort(event.currentTarget.dataset.startMode || "resume");
    } else if (action === "edit-job" && jobId) {
      editJob(jobId);
    } else if (action === "cancel-edit-job" || action === "clear-job-draft") {
      resetJobDraft();
      render();
    } else if (action === "duplicate-job" && jobId) {
      await duplicateJob(jobId);
    } else if (action === "pause-job" && jobId) {
      await changeJobStatus(jobId, "pause");
    } else if (action === "resume-job" && jobId) {
      await changeJobStatus(jobId, "resume");
    } else if (action === "queue-job" && jobId) {
      await openWorklistPreview(jobId);
    } else if (action === "discard-job" && jobId) {
      await discardJob(jobId);
    } else if (action === "assign") {
      await assignFromButton(event.currentTarget);
    } else if (action === "skip-current") {
      await skipCurrent(currentImage());
    } else if (action === "add-favorite") {
      await addFavoriteFromButton(event.currentTarget);
    } else if (action === "remove-favorite") {
      await removeFavorite(numberOrNull(event.currentTarget.dataset.favoriteId));
    } else if (action === "open-folder-picker") {
      await openFolderPicker(event.currentTarget.dataset.pickerField);
    } else if (action === "close-folder-picker") {
      closeFolderPicker();
    } else if (action === "folder-picker-open") {
      await loadFolderPicker(event.currentTarget.dataset.folderPath || "/");
    } else if (action === "folder-picker-parent") {
      await loadFolderPicker(state.folderPicker.data?.parent || "/");
    } else if (action === "choose-folder") {
      chooseFolder(event.currentTarget.dataset.folderPath || state.folderPicker.path || "/");
    } else if (action === "browse-target-folder") {
      await browseTargetFolder(event.currentTarget.dataset.targetPath || "/");
    } else if (action === "browse-target-parent") {
      await browseTargetFolder(state.targetFolderPage?.parent || "/");
    } else if (action === "create-target") {
      await createTargetFromInput();
    } else if (action === "focus-target-create") {
      focusTargetCreate();
    } else if (action === "clear-target-search") {
      await clearTargetSearch();
    } else if (action === "undo-last-decision") {
      await undoLastDecision();
    } else if (action === "close-worklist-preview") {
      closeWorklistPreview();
    } else if (action === "refresh-worklist-preview") {
      await loadWorklistPreview(state.worklist.jobId);
    } else if (action === "toggle-worklist-repair") {
      state.worklist.repairOpen = !state.worklist.repairOpen;
      state.worklist.filter = state.worklist.repairOpen ? "issues" : state.worklist.filter;
      render();
    } else if (action === "repair-create-target-folder") {
      await createRepairTargetFolder(event.currentTarget);
    } else if (action === "repair-go-sort" && jobId) {
      closeWorklistPreview();
      await openSort(jobId, "unsorted");
    } else if (action === "repair-reset-item" && jobId) {
      await resetRepairItem(jobId, numberOrNull(event.currentTarget.dataset.queueItemId), false);
    } else if (action === "repair-reset-item-and-sort" && jobId) {
      await resetRepairItem(jobId, numberOrNull(event.currentTarget.dataset.queueItemId), true);
    } else if (action === "repair-reset-visible-errors" && jobId) {
      await resetVisibleRepairItems(jobId, false);
    } else if (action === "repair-reset-visible-errors-and-sort" && jobId) {
      await resetVisibleRepairItems(jobId, true);
    } else if (action === "repair-auto-rename-item" && jobId) {
      await autoRenameRepairItem(jobId, numberOrNull(event.currentTarget.dataset.queueItemId));
    } else if (action === "repair-auto-rename-visible-conflicts" && jobId) {
      await autoRenameVisibleConflicts(jobId);
    } else if (action === "toggle-worklist-auto") {
      state.worklist.autoProcess = Boolean(event.currentTarget.checked);
      render();
    } else if (action === "filter-worklist") {
      state.worklist.filter = event.currentTarget.dataset.worklistFilter || "all";
      render();
    } else if (action === "confirm-queue-job" && jobId) {
      await confirmQueueJob(jobId);
    } else if (action === "process-job-now" && jobId) {
      await processJobNow(jobId);
    } else if (action === "process-job-now-direct" && jobId) {
      await processJobNowFromDashboard(jobId);
    } else if (action === "remove-worklist-item" && jobId) {
      await removeWorklistItem(jobId, numberOrNull(event.currentTarget.dataset.queueItemId));
    } else if (action === "select-image") {
      setImageIndex(numberOrNull(event.currentTarget.dataset.index) ?? state.imageIndex);
    } else if (action === "page-next") {
      await goToImagePage(pageInfo().nextCursor, 0);
    } else if (action === "page-prev") {
      await goToImagePage(pageInfo().previousCursor, PAGE_LIMIT - 1);
    } else if (action === "refresh-logs") {
      await loadLogs();
    } else if (action === "change-log-level") {
      state.logs.level = event.currentTarget.value || "";
      await loadLogs();
    } else if (action === "show-log") {
      state.logs.jobId = null;
      await openLogs();
    } else if (action === "show-job-log" && jobId) {
      state.logs.jobId = jobId;
      await openLogs();
    } else if (action === "show-settings") {
      await openSettings();
    } else if (action === "refresh-settings") {
      await loadAdminSettings();
    } else if (action === "export-diagnostics") {
      await exportDiagnostics();
    } else if (action === "export-diagnostics-anonymized") {
      await exportDiagnostics({ anonymized: true });
    } else if (action === "export-diagnostics-all") {
      await exportDiagnostics({ scopeAll: true });
    } else if (action === "export-diagnostics-all-anonymized") {
      await exportDiagnostics({ anonymized: true, scopeAll: true });
    }
  }

  function focusNewFlow() {
    state.page = "jobs";
    state.sortState = null;
    state.imagePage = null;
    state.pageCursor = null;
    state.toast = null;
    resetJobDraft();
    render();
    focusAfterRender("#imageflow-job-form", "#ifl-name");
  }

  function focusTargetCreate() {
    state.targetCreateOpen = true;
    state.targetCreateBusy = false;
    render();
    focusAfterRender(".imageflow-target-create", "[data-target-create-name]");
  }

  function focusAfterRender(sectionSelector, inputSelector) {
    window.requestAnimationFrame(() => {
      const section = root.querySelector(sectionSelector);
      const input = root.querySelector(inputSelector);
      section?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      input?.focus({ preventScroll: true });
    });
  }

  function bindFavoriteDragAndDrop() {
    root.querySelectorAll(".imageflow-favorite-row[draggable='true']").forEach((row) => {
      row.addEventListener("dragstart", handleFavoriteDragStart);
      row.addEventListener("dragover", handleFavoriteDragOver);
      row.addEventListener("drop", handleFavoriteDrop);
      row.addEventListener("dragend", handleFavoriteDragEnd);
    });
  }

  function handleFavoriteDragStart(event) {
    const id = event.currentTarget.dataset.favoriteId;
    state.dragFavoriteId = id;
    event.currentTarget.classList.add("is-dragging");
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", id || "");
    }
  }

  function handleFavoriteDragOver(event) {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "move";
    }
  }

  async function handleFavoriteDrop(event) {
    event.preventDefault();
    const targetId = event.currentTarget.dataset.favoriteId;
    const sourceId = event.dataTransfer?.getData("text/plain") || state.dragFavoriteId;
    if (!sourceId || !targetId || sourceId === targetId) {
      return;
    }

    const ids = realFavorites().map((favorite) => String(favorite.id));
    const sourceIndex = ids.indexOf(String(sourceId));
    const targetIndex = ids.indexOf(String(targetId));
    if (sourceIndex === -1 || targetIndex === -1) {
      return;
    }
    ids.splice(sourceIndex, 1);
    ids.splice(targetIndex, 0, String(sourceId));
    await reorderFavorites(ids);
  }

  function handleFavoriteDragEnd(event) {
    state.dragFavoriteId = null;
    event.currentTarget.classList.remove("is-dragging");
  }

  function editJob(jobId) {
    const job = state.jobs.find((item) => item.id === jobId);
    if (!job) {
      state.toast = { type: "error", message: "Dieser Flow wurde nicht gefunden." };
      render();
      return;
    }

    state.jobDraft = {
      editingJobId: job.id,
      name: job.name || "",
      sourcePath: job.sourcePath || "/",
      targetMode: job.targetMode || "album",
      targetPath: job.targetPath || DEFAULT_TARGET_PATH,
      recursiveSource: Boolean(job.options?.recursiveSource),
      safeMode: job.safeMode !== false,
      autoProcess: Boolean(job.options?.autoProcess),
      preloadMode: job.options?.preloadMode || "balanced",
      targetOrdering: job.options?.targetOrdering || "relevance",
      hotkeys: job.options?.hotkeys || "number-row",
      customHotkeys: normalizeCustomHotkeys(job.options?.customHotkeys || []),
    };
    state.toast = { type: "info", message: "Flow ist zum Bearbeiten geöffnet." };
    render();
  }

  async function duplicateJob(jobId) {
    try {
      const payload = await request(`/api/v1/jobs/${jobId}/duplicate`, { method: "POST", body: {} });
      state.jobs = [payload.job, ...state.jobs.filter((job) => job.id !== payload.job.id)];
      state.toast = { type: "info", message: "Flow wurde dupliziert." };
      render();
    } catch (error) {
      state.toast = { type: "error", message: error.message || "Flow konnte nicht kopiert werden." };
      render();
    }
  }

  async function openFolderPicker(field) {
    readJobDraft();
    const path = field === "targetPath" ? state.jobDraft.targetPath : state.jobDraft.sourcePath;
    state.folderPicker = {
      open: true,
      field: field || "sourcePath",
      path: normalizeDisplayPath(path || "/"),
      data: null,
      loading: true,
      error: null,
    };
    render();
    await loadFolderPicker(state.folderPicker.path);
  }

  async function loadFolderPicker(path) {
    state.folderPicker.loading = true;
    state.folderPicker.error = null;
    render();
    try {
      const data = await request(`/api/v1/folders?path=${encodeURIComponent(normalizeDisplayPath(path || "/"))}&limit=150`);
      state.folderPicker = {
        ...state.folderPicker,
        path: data.current?.path || normalizeDisplayPath(path || "/"),
        data,
        loading: false,
        error: null,
      };
      render();
    } catch (error) {
      state.folderPicker = {
        ...state.folderPicker,
        loading: false,
        error: error.message || "Ordner konnte nicht geladen werden.",
      };
      render();
    }
  }

  function closeFolderPicker() {
    state.folderPicker = {
      open: false,
      field: null,
      path: "/",
      data: null,
      loading: false,
      error: null,
    };
    render();
  }

  function chooseFolder(path) {
    const selected = normalizeDisplayPath(path || "/");
    if (state.folderPicker.field === "targetPath") {
      state.jobDraft.targetPath = selected;
    } else {
      state.jobDraft.sourcePath = selected;
    }
    closeFolderPicker();
  }

  async function browseTargetFolder(path) {
    if (!state.sortState?.job) {
      return;
    }
    state.targetBrowsePath = normalizeDisplayPath(path || "/");
    await loadTargets(state.sortState.job.targetMode);
    render();
  }

  function searchTargetsSoon() {
    window.clearTimeout(targetSearchTimer);
    targetSearchTimer = window.setTimeout(async () => {
      if (!state.sortState?.job) {
        return;
      }
      const query = state.targetQuery;
      const mode = state.sortState.job.targetMode;
      await loadTargets(state.sortState.job.targetMode);
      if (query !== state.targetQuery || mode !== state.sortState?.job?.targetMode) {
        return;
      }
      render();
      const input = root.querySelector("[data-target-query]");
      input?.focus();
    }, 180);
  }

  async function clearTargetSearch() {
    if (!state.targetQuery) {
      return;
    }
    window.clearTimeout(targetSearchTimer);
    state.targetQuery = "";
    if (state.sortState?.job) {
      await loadTargets(state.sortState.job.targetMode);
    }
    render();
    const input = root.querySelector("[data-target-query]");
    input?.focus();
  }

  async function createTargetFromInput() {
    const job = state.sortState?.job;
    if (!job || state.targetCreateBusy) {
      return;
    }

    const input = root.querySelector("[data-target-create-name]");
    const name = String(input?.value || state.targetCreateName || "").trim();
    if (!name) {
      state.toast = { type: "error", message: "Bitte gib dem neuen Ziel einen Namen." };
      render();
      return;
    }

    const isFolderMode = job.targetMode === "move" || job.targetMode === "copy";
    const parentPathValue = state.targetFolderPage?.current?.path || state.targetBrowsePath || job.targetPath || "/";
    state.targetCreateName = name;
    state.targetCreateBusy = true;
    render();
    try {
      const payload = await request("/api/v1/targets", {
        method: "POST",
        body: {
          mode: job.targetMode,
          name,
          path: isFolderMode ? normalizeDisplayPath(parentPathValue) : undefined,
        },
      });
      if (payload.folders) {
        state.targetFolderPage = payload.folders;
        state.targetBrowsePath = payload.folders.current?.path || normalizeDisplayPath(parentPathValue);
        state.targets = mergeTargetList(payload.target, payload.folders.folders || []);
      } else {
        state.targets = mergeTargetList(payload.target, payload.targets || state.targets);
      }
      state.targetCreateName = "";
      state.targetCreateOpen = false;
      state.targetCreateBusy = false;
      state.targetQuery = "";
      state.toast = {
        type: "info",
        message: payload.duplicate ? "Dieses Ziel war schon vorhanden." : `${isFolderMode ? "Ordner" : "Album"} wurde angelegt.`,
      };
      render();
    } catch (error) {
      state.targetCreateBusy = false;
      state.toast = { type: "error", message: error.message || "Ziel konnte nicht angelegt werden." };
      render();
    }
  }

  async function createRepairTargetFolder(button) {
    const jobId = numberOrNull(button?.dataset.jobId) || state.worklist.jobId;
    const targetPath = normalizeDisplayPath(button?.dataset.targetPath || "");
    const name = pathBaseName(targetPath);
    const parent = parentPath(targetPath);
    const mode = button?.dataset.operationType || state.worklist.preview?.job?.targetMode || "copy";
    if (!jobId || !name || !parent) {
      state.worklist.error = "Zielordner konnte nicht eindeutig bestimmt werden.";
      render();
      return;
    }

    state.worklist.loading = true;
    state.worklist.error = null;
    render();
    try {
      await request("/api/v1/targets", {
        method: "POST",
        body: {
          mode: ["copy", "move"].includes(mode) ? mode : "copy",
          name,
          path: parent,
        },
      });
      state.toast = { type: "info", message: "Das Ziel wurde angelegt. Die Ablage wird erneut geprüft." };
      state.worklist.repairOpen = true;
      await loadWorklistPreview(jobId);
    } catch (error) {
      state.worklist.loading = false;
      state.worklist.error = error.message || "Zielordner konnte nicht angelegt werden.";
      render();
    }
  }

  async function resetRepairItem(jobId, queueItemId, openAfterReset = false) {
    if (!jobId || !queueItemId) {
      return;
    }
    await removeWorklistItem(jobId, queueItemId, {
      successMessage: "Der Eintrag wurde aus dem Stapel entfernt.",
      keepRepairOpen: true,
      reloadPreview: true,
    });
    if (openAfterReset && !state.worklist.error) {
      closeWorklistPreview();
      await openSort(jobId, "unsorted");
    }
  }

  async function resetVisibleRepairItems(jobId, openAfterReset = false) {
    if (!jobId) {
      return;
    }
    const preview = state.worklist.preview;
    const items = worklistErrorItems(preview?.items || []).filter(isResettableWorklistItem);
    if (!items.length) {
      state.worklist.error = "Es gibt keine sichtbaren Fehler, die zurückgesetzt werden können.";
      render();
      return;
    }

    state.worklist.loading = true;
    state.worklist.error = null;
    render();
    let removed = 0;
    try {
      for (const item of items) {
        await request(`/api/v1/jobs/${jobId}/queue/${item.id}`, { method: "DELETE", body: {} });
        removePreviewItemLocally(item.id);
        removed += 1;
      }
      state.worklist.loading = false;
      state.worklist.repairOpen = !openAfterReset;
      state.toast = {
        type: "info",
        message: removed === 1 ? "Der Eintrag wurde aus dem Stapel entfernt." : "Die sichtbaren Fehler wurden aus dem Stapel entfernt.",
      };
      await loadWorklistPreview(jobId);
      if (openAfterReset) {
        closeWorklistPreview();
        await openSort(jobId, "unsorted");
      }
    } catch (error) {
      state.worklist.loading = false;
      state.worklist.error = error.message || "Die Fehler konnten nicht zurückgesetzt werden.";
      render();
    }
  }

  async function autoRenameRepairItem(jobId, queueItemId) {
    if (!jobId || !queueItemId) {
      return;
    }

    state.worklist.loading = true;
    state.worklist.error = null;
    render();
    try {
      const payload = await request(`/api/v1/jobs/${jobId}/queue/${queueItemId}/auto-rename`, { method: "POST", body: {} });
      if (payload.job) {
        state.jobs = state.jobs.map((job) => (job.id === jobId ? payload.job : job));
      }
      state.worklist.repairOpen = true;
      state.worklist.filter = "all";
      state.toast = {
        type: "info",
        message: payload.message || "Der Ablagepunkt wurde mit neuem Namen vorbereitet.",
      };
      await loadWorklistPreview(jobId);
    } catch (error) {
      state.worklist.loading = false;
      state.worklist.error = error.message || "Der Ablagepunkt konnte nicht automatisch umbenannt werden.";
      render();
    }
  }

  async function autoRenameVisibleConflicts(jobId) {
    if (!jobId) {
      return;
    }
    const preview = state.worklist.preview;
    const items = worklistErrorItems(preview?.items || []).filter(isAutoRenameableWorklistItem);
    if (!items.length) {
      state.worklist.error = "Es gibt keine sichtbaren Zielkonflikte, die automatisch umbenannt werden können.";
      render();
      return;
    }

    state.worklist.loading = true;
    state.worklist.error = null;
    render();
    try {
      let lastPayload = null;
      for (const item of items) {
        lastPayload = await request(`/api/v1/jobs/${jobId}/queue/${item.id}/auto-rename`, { method: "POST", body: {} });
      }
      if (lastPayload?.job) {
        state.jobs = state.jobs.map((job) => (job.id === jobId ? lastPayload.job : job));
      }
      state.worklist.repairOpen = true;
      state.worklist.filter = "all";
      state.toast = {
        type: "info",
        message: items.length === 1
          ? (lastPayload?.message || "Der Ablagepunkt wurde mit neuem Namen vorbereitet.")
          : "Die sichtbaren Zielkonflikte wurden mit neuen Namen vorbereitet.",
      };
      await loadWorklistPreview(jobId);
    } catch (error) {
      state.worklist.loading = false;
      state.worklist.error = error.message || "Die Zielkonflikte konnten nicht automatisch umbenannt werden.";
      render();
    }
  }

  function mergeTargetList(target, targets) {
    const list = Array.isArray(targets) ? targets : [];
    if (!target) {
      return list;
    }
    const targetKey = String(target.id || target.path || target.label || target.name || "");
    return [
      target,
      ...list.filter((item) => String(item.id || item.path || item.label || item.name || "") !== targetKey),
    ];
  }

  async function openWorklistPreview(jobId) {
    state.worklist = {
      open: true,
      jobId,
      loading: true,
      preview: null,
      error: null,
      autoProcess: Boolean((state.jobs.find((job) => job.id === jobId)?.options || {}).autoProcess),
      filter: "all",
      repairOpen: false,
    };
    render();
    await loadWorklistPreview(jobId);
  }

  async function loadWorklistPreview(jobId) {
    if (!jobId) {
      return;
    }
    state.worklist.loading = true;
    state.worklist.error = null;
    render();
    try {
      const preview = await request(`/api/v1/jobs/${jobId}/worklist-preview?limit=250`);
      const logPayload = await request(`/api/v1/logs?jobId=${encodeURIComponent(String(jobId))}&limit=80`).catch(() => ({ logs: [] }));
      preview.logs = logPayload.logs || [];
      state.worklist = {
        ...state.worklist,
        jobId,
        loading: false,
        preview,
        autoProcess: Boolean(preview.autoProcess ?? preview.job?.options?.autoProcess ?? state.worklist.autoProcess),
        error: null,
      };
      render();
    } catch (error) {
      state.worklist = {
        ...state.worklist,
        loading: false,
        error: error.message || "Ablage konnte nicht geprüft werden.",
      };
      render();
    }
  }

  function closeWorklistPreview() {
    state.worklist = {
      open: false,
      jobId: null,
      loading: false,
      preview: null,
      error: null,
      autoProcess: false,
      filter: "all",
      repairOpen: false,
    };
    render();
  }

  async function openLogs() {
    state.page = "logs";
    state.sortState = null;
    state.imagePage = null;
    state.pageCursor = null;
    await loadLogs();
  }

  async function loadLogs() {
    state.logs.loading = true;
    state.logs.error = null;
    render();
    try {
      const params = new URLSearchParams({ limit: "120" });
      if (state.logs.level) {
        params.set("level", state.logs.level);
      }
      if (state.logs.jobId) {
        params.set("jobId", String(state.logs.jobId));
      }
      const payload = await request(`/api/v1/logs?${params.toString()}`);
      state.logs = {
        ...state.logs,
        loading: false,
        items: payload.logs || [],
        diagnostics: payload.diagnostics || null,
        error: null,
      };
      render();
    } catch (error) {
      state.logs = {
        ...state.logs,
        loading: false,
        error: error.message || "Protokoll konnte nicht geladen werden.",
      };
      render();
    }
  }

  async function openSettings() {
    state.page = "settings";
    state.sortState = null;
    state.imagePage = null;
    state.pageCursor = null;
    await loadAdminSettings();
  }

  async function loadAdminSettings() {
    state.adminSettings.loading = true;
    state.adminSettings.error = null;
    render();
    try {
      const payload = await request("/api/v1/admin/settings");
      state.adminSettings = {
        ...state.adminSettings,
        loading: false,
        data: payload,
        error: null,
      };
      await refreshHealthQuietly();
      render();
    } catch (error) {
      state.adminSettings = {
        ...state.adminSettings,
        loading: false,
        error: error.message || "Betriebseinstellungen konnten nicht geladen werden.",
      };
      render();
    }
  }

  async function saveAdminSettings(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const elements = form.elements;
    const settingsBody = {
      realExecutionEnabled: Boolean(elements.namedItem("realExecutionEnabled")?.checked),
      backgroundProcessingEnabled: Boolean(elements.namedItem("backgroundProcessingEnabled")?.checked),
      backgroundLowLoadOnly: Boolean(elements.namedItem("backgroundLowLoadOnly")?.checked),
      backgroundMaxLoadPercent: Number(elements.namedItem("backgroundMaxLoadPercent")?.value || 70),
      quietHoursEnabled: Boolean(elements.namedItem("quietHoursEnabled")?.checked),
      quietHoursStart: elements.namedItem("quietHoursStart")?.value || "22:00",
      quietHoursEnd: elements.namedItem("quietHoursEnd")?.value || "06:00",
    };
    state.adminSettings.saving = true;
    state.adminSettings.error = null;
    render();
    try {
      const payload = await request("/api/v1/admin/settings", {
        method: "PUT",
        body: settingsBody,
      });
      state.adminSettings = {
        ...state.adminSettings,
        saving: false,
        data: payload,
        error: null,
      };
      await refreshHealthQuietly();
      state.toast = { type: "info", message: "Betriebseinstellungen wurden gespeichert." };
      render();
    } catch (error) {
      state.adminSettings = {
        ...state.adminSettings,
        saving: false,
        error: error.message || "Betriebseinstellungen konnten nicht gespeichert werden.",
      };
      render();
    }
  }

  async function refreshHealthQuietly() {
    try {
      state.health = await request("/api/v1/health");
    } catch (error) {
      state.health = state.health || null;
    }
  }

  async function exportDiagnostics(options = {}) {
    try {
      const params = new URLSearchParams();
      if (options.anonymized) {
        params.set("anonymized", "1");
      }
      if (options.scopeAll) {
        params.set("scopeAll", "1");
      }
      const query = params.toString();
      const payload = await request(`/api/v1/support/export${query ? `?${query}` : ""}`);
      const json = JSON.stringify(payload, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const label = options.anonymized ? "support-anonymized" : "diagnostics";
      link.download = `imageflow-${label}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      state.toast = { type: "info", message: options.anonymized ? "Anonymisierter Supportexport wurde erstellt." : "Diagnoseexport wurde erstellt." };
      render();
    } catch (error) {
      state.logs.error = error.message || "Diagnoseexport konnte nicht erstellt werden.";
      render();
    }
  }

  async function confirmQueueJob(jobId) {
    try {
      const wasQueued = Number(state.worklist.preview?.summary?.queued || 0) > 0 && !state.worklist.preview?.canQueue;
      const payload = await request(`/api/v1/jobs/${jobId}/queue-execution`, {
        method: "POST",
        body: {
          autoProcess: state.worklist.autoProcess,
        },
      });
      state.jobs = state.jobs.map((job) => (job.id === jobId ? payload.job : job));
      state.worklist.preview = payload.preview || state.worklist.preview;
      const realWrites = state.worklist.preview?.executionMode === "real-writes-enabled";
      state.toast = {
        type: "info",
        message: wasQueued
          ? "Ablage-Einstellung wurde gemerkt."
          : realWrites
          ? (state.worklist.autoProcess
            ? "Ablage ist für die Automatik freigegeben."
            : "Ablage ist freigegeben. Du kannst sie jetzt manuell ausführen.")
          : "Ablage wurde für später vorgemerkt. Reale Dateiänderungen bleiben gesperrt.",
      };
      render();
    } catch (error) {
      state.worklist.error = error.message || "Ablage konnte nicht für später gemerkt werden.";
      render();
    }
  }

  async function processJobNow(jobId) {
    state.worklist.loading = true;
    state.worklist.error = null;
    render();
    try {
      const payload = await request(`/api/v1/jobs/${jobId}/process-now`, { method: "POST", body: { limit: 25 } });
      state.jobs = state.jobs.map((job) => (job.id === jobId ? payload.job : job));
      state.worklist.preview = payload.preview || state.worklist.preview;
      state.worklist.loading = false;
      state.toast = { type: "info", message: payload.result?.message || "Ablage wurde abgelegt." };
      render();
    } catch (error) {
      state.worklist.loading = false;
      state.worklist.error = error.message || "Ablage konnte nicht abgelegt werden.";
      render();
    }
  }

  async function processJobNowFromDashboard(jobId) {
    try {
      state.toast = { type: "info", message: "Ablage wird gestartet." };
      render();
      const payload = await request(`/api/v1/jobs/${jobId}/process-now`, { method: "POST", body: { limit: 25 } });
      state.jobs = state.jobs.map((job) => (job.id === jobId ? payload.job : job));
      state.toast = { type: "info", message: payload.result?.message || "Ablage wurde abgelegt." };
      render();
    } catch (error) {
      state.toast = { type: "error", message: error.message || "Ablage konnte nicht gestartet werden." };
      render();
    }
  }

  async function removeWorklistItem(jobId, queueItemId, options = {}) {
    if (!jobId || !queueItemId) {
      return;
    }

    try {
      const removedBeforeRequest = state.worklist.preview?.items?.find((item) => Number(item.id) === Number(queueItemId));
      const payload = await request(`/api/v1/jobs/${jobId}/queue/${queueItemId}`, { method: "DELETE", body: {} });
      if (payload.job) {
        state.jobs = state.jobs.map((job) => (job.id === jobId ? payload.job : job));
        if (state.sortState?.job?.id === jobId) {
          state.sortState.job = payload.job;
        }
      }
      removePreviewItemLocally(queueItemId);
      if (options.keepRepairOpen) {
        state.worklist.repairOpen = true;
      }
      state.toast = {
        type: "info",
        message: options.successMessage || (removedBeforeRequest?.readiness === "error" ? "Der fehlerhafte Eintrag wurde zurückgesetzt." : "Ablagepunkt wurde entfernt."),
      };
      if (options.reloadPreview) {
        await loadWorklistPreview(jobId);
        return;
      }
      render();
    } catch (error) {
      state.worklist.error = error.message || "Ablagepunkt konnte nicht entfernt werden.";
      render();
    }
  }

  function removePreviewItemLocally(queueItemId) {
    const preview = state.worklist.preview;
    if (!preview || !Array.isArray(preview.items)) {
      return;
    }
    const removed = preview.items.find((item) => Number(item.id) === Number(queueItemId));
    preview.items = preview.items.filter((item) => Number(item.id) !== Number(queueItemId));
    if (!removed || !preview.summary) {
      return;
    }
    const summary = preview.summary;
    summary.total = Math.max(0, Number(summary.total || 0) - 1);
    if (summary[removed.status] !== undefined) {
      summary[removed.status] = Math.max(0, Number(summary[removed.status] || 0) - 1);
    }
    if (removed.readiness === "ready") {
      summary.ready = Math.max(0, Number(summary.ready || 0) - 1);
    } else if (removed.readiness === "warning") {
      summary.warnings = Math.max(0, Number(summary.warnings || 0) - 1);
    } else {
      summary.errors = Math.max(0, Number(summary.errors || 0) - 1);
    }
    if (preview.window) {
      preview.window.total = Math.max(0, Number(preview.window.total || 0) - 1);
      preview.window.shown = Math.max(0, Number(preview.window.shown || 0) - 1);
      preview.window.truncated = Number(preview.window.total || 0) > Number(preview.window.shown || 0);
    }
    preview.canQueue = Number(summary.planned || 0) > 0 && Number(summary.errors || 0) === 0;
  }

  async function openSort(jobId, startMode) {
    rememberBeginStartNotice(jobId, startMode);
    state.page = "sort";
    scrollToTopOnRender = true;
    state.jobId = jobId;
    state.imageIndex = 0;
    state.sortState = null;
    state.imagePage = null;
    state.pageCursor = null;
    state.startMode = startMode;
    clearProgressBaseline();
    state.targetBrowsePath = null;
    state.targetFolderPage = null;
    state.targetCreateName = "";
    state.targetCreateOpen = false;
    state.targetCreateBusy = false;
    state.targetQuery = "";
    clearImagePageCache();
    resetSessionFlow();
    await load();
  }

  async function restartSort(startMode) {
    rememberBeginStartNotice(state.jobId, startMode);
    state.imageIndex = 0;
    state.imagePage = null;
    state.pageCursor = null;
    state.startMode = startMode;
    clearProgressBaseline();
    clearImagePageCache();
    resetSessionFlow();
    await loadImagePage(null, null, true, startMode);
  }

  function rememberBeginStartNotice(jobId, startMode) {
    if (startMode !== "begin") {
      return;
    }
    const job = state.sortState?.job?.id === jobId
      ? state.sortState.job
      : state.jobs.find((item) => String(item.id) === String(jobId));
    if (Number(job?.executedOperations || 0) > 0) {
      state.toast = {
        type: "info",
        message: "Du siehst den Flow nur wieder von vorn. Bereits abgelegte Dateien werden nicht automatisch zurückgeholt.",
      };
    }
  }

  async function changeJobStatus(jobId, operation) {
    try {
      const payload = await request(`/api/v1/jobs/${jobId}/${operation}`, { method: "POST", body: {} });
      state.jobs = state.jobs.map((job) => (job.id === jobId ? payload.job : job));
      state.toast = { type: "info", message: "Flow-Status wurde aktualisiert." };
      render();
    } catch (error) {
      state.toast = { type: "error", message: error.message || "Flow-Status konnte nicht aktualisiert werden." };
      render();
    }
  }

  async function discardJob(jobId) {
    const job = state.jobs.find((item) => item.id === jobId);
    const label = job?.name || `Flow ${jobId}`;
    if (typeof window.confirm === "function" && !window.confirm(`Flow "${label}" verwerfen?`)) {
      return;
    }

    try {
      await request(`/api/v1/jobs/${jobId}/discard`, { method: "POST", body: {} });
      state.jobs = state.jobs.filter((item) => item.id !== jobId);
      if (state.jobDraft.editingJobId === jobId) {
        resetJobDraft();
      }
      state.toast = { type: "info", message: "Flow wurde verworfen." };
      render();
    } catch (error) {
      state.toast = { type: "error", message: error.message || "Flow konnte nicht verworfen werden." };
      render();
    }
  }

  async function assignFromButton(button) {
    const sourcePath = button.dataset.sourcePath || "";
    if (!beginDecisionSave(sourcePath)) {
      return;
    }
    const target = {
      id: button.dataset.targetId || "",
      label: button.dataset.targetLabel || "Ziel",
      path: button.dataset.targetPath || "",
    };
    try {
      const payload = await request(`/api/v1/jobs/${state.jobId}/assign`, {
        method: "POST",
        body: {
          sourcePath,
          target,
          hotkey: button.dataset.hotkey || "",
          fileId: button.dataset.fileId || null,
          fileName: button.dataset.fileName || "",
          mimeType: button.dataset.mimeType || "",
        },
      });
      state.toast = {
        type: "info",
        message: payload.duplicate ? `Schon vorgemerkt: ${target.label}` : `Entschieden: ${target.label}`,
      };
      completeCurrentDecision(payload.duplicate ? "duplicate" : "assign", target.label);
      await refillImagesAfterDecision();
      finishDecisionSave();
      render();
    } catch (error) {
      finishDecisionSave();
      state.toast = { type: "error", message: error.message || "Entscheidung konnte nicht gespeichert werden." };
      render();
    }
  }

  async function undoLastDecision() {
    if (!state.jobId) {
      return;
    }

    try {
      const payload = await request(`/api/v1/jobs/${state.jobId}/undo`, { method: "POST", body: {} });
      if (payload.job && state.sortState) {
        state.sortState.job = payload.job;
        state.jobs = state.jobs.map((job) => (job.id === payload.job.id ? payload.job : job));
      } else if (state.sortState?.job) {
        state.sortState.job.sortedFiles = Math.max(0, Number(state.sortState.job.sortedFiles || 0) - 1);
        state.sortState.job.queuedOperations = Math.max(0, Number(state.sortState.job.queuedOperations || 0) - 1);
      }
      state.decisionStreak = Math.max(0, Number(state.decisionStreak || 0) - 1);
      state.decisionsThisSession = Math.max(0, Number(state.decisionsThisSession || 0) - 1);
      state.feedback = null;
      state.toast = { type: "info", message: payload.message || "Letzte Entscheidung wurde zurückgenommen." };
      clearImagePageCache();
      state.acceptDecreasedCounters = true;
      await loadImagePage(state.pageCursor, state.imageIndex, false, null);
      render();
    } catch (error) {
      state.toast = { type: "error", message: error.message || "Letzte Entscheidung konnte nicht zurückgenommen werden." };
      render();
    }
  }

  async function addFavoriteFromButton(button) {
    if (!state.sortState?.job) {
      return;
    }

    try {
      const payload = await request("/api/v1/favorites", {
        method: "POST",
        body: {
          mode: state.sortState.job.targetMode,
          targetId: button.dataset.targetId || "",
          targetLabel: button.dataset.targetLabel || "Ziel",
          targetPath: button.dataset.targetPath || "",
        },
      });
      applyFavorites(payload.favorites);
      state.toast = {
        type: "info",
        message: payload.duplicate ? "Schnellziel ist schon da." : "Schnellziel wurde hinzugefügt.",
      };
      render();
    } catch (error) {
      state.toast = { type: "error", message: error.message || "Schnellziel konnte nicht gespeichert werden." };
      render();
    }
  }

  async function removeFavorite(favoriteId) {
    if (!favoriteId) {
      return;
    }

    try {
      const payload = await request(`/api/v1/favorites/${favoriteId}`, { method: "DELETE", body: {} });
      applyFavorites(payload.favorites);
      state.toast = { type: "info", message: "Schnellziel wurde entfernt." };
      render();
    } catch (error) {
      state.toast = { type: "error", message: error.message || "Schnellziel konnte nicht entfernt werden." };
      render();
    }
  }

  async function reorderFavorites(favoriteIds) {
    if (!state.sortState?.job) {
      return;
    }

    const previous = state.sortState.favorites || [];
    applyFavorites(reorderedFavorites(favoriteIds));
    render();

    try {
      const payload = await request("/api/v1/favorites/reorder", {
        method: "POST",
        body: {
          mode: state.sortState.job.targetMode,
          favoriteIds,
        },
      });
      applyFavorites(payload.favorites);
      state.toast = { type: "info", message: "Reihenfolge der Schnellziele gespeichert." };
      render();
    } catch (error) {
      state.sortState.favorites = previous;
      state.toast = { type: "error", message: error.message || "Reihenfolge der Schnellziele konnte nicht gespeichert werden." };
      render();
    }
  }

  async function handleHotkey(event) {
    if (event.target && ["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName)) {
      return;
    }
    if (state.decisionInFlight) {
      event.preventDefault();
      return;
    }
    const sortState = state.sortState || mockSortState(state.jobId || 1);
    if ((event.ctrlKey || event.metaKey) && String(event.key || "").toLowerCase() === "z") {
      event.preventDefault();
      await undoLastDecision();
      return;
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      await moveImage(1);
      return;
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      await moveImage(-1);
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      await goToImagePage(0, 0);
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      const page = pageInfo(sortState);
      await goToImagePage(Math.max(0, Number(page.total || 0) - Number(page.limit || PAGE_LIMIT)), PAGE_LIMIT - 1);
      return;
    }
    if (event.key === " " || event.key === "0") {
      event.preventDefault();
      await skipCurrent(currentImage(sortState));
      return;
    }
    const pressedKey = String(event.key || "").toLowerCase();
    const favorite = (sortState.favorites || []).find((item) => String(item.hotkey || "").toLowerCase() === pressedKey);
    if (favorite) {
      event.preventDefault();
      const current = currentImage(sortState);
      const button = {
        dataset: {
          fileId: current?.fileId || "",
          fileName: current?.name || "",
          mimeType: current?.mimeType || "",
          sourcePath: current?.path || "",
          targetId: favorite.targetId || favorite.id || "",
          targetLabel: favorite.label,
          targetPath: favorite.path || "",
          hotkey: favorite.hotkey || "",
        },
      };
      await assignFromButton(button);
    }
  }

  async function skipCurrent(current) {
    if (!beginDecisionSave(current?.path || "")) {
      return;
    }
    try {
      const payload = await request(`/api/v1/jobs/${state.jobId}/skip`, {
        method: "POST",
        body: {
          sourcePath: current?.path || "",
          hotkey: "0",
          fileId: current?.fileId || null,
          fileName: current?.name || "",
          mimeType: current?.mimeType || "",
        },
      });
      state.toast = { type: "info", message: payload.duplicate ? "Schon entschieden." : "Weiter zum nächsten Bild." };
      completeCurrentDecision(payload.duplicate ? "duplicate" : "skip", "nächstes Bild");
      await refillImagesAfterDecision();
      finishDecisionSave();
      render();
    } catch (error) {
      finishDecisionSave();
      state.toast = { type: "error", message: error.message || "Bild konnte nicht übersprungen werden." };
      render();
    }
  }

  function beginDecisionSave(sourcePath) {
    if (!sourcePath || state.decisionInFlight) {
      return false;
    }
    state.decisionInFlight = true;
    state.decisionSourcePath = sourcePath;
    render();
    return true;
  }

  function finishDecisionSave() {
    state.decisionInFlight = false;
    state.decisionSourcePath = null;
  }

  function sortImages(sortState = state.sortState) {
    return Array.isArray(sortState?.nextImages) ? sortState.nextImages : [];
  }

  function realFavorites(sortState = state.sortState) {
    return (sortState?.favorites || []).filter((favorite) => !favorite.locked && favorite.id !== "skip");
  }

  function applyFavorites(favorites) {
    if (!state.sortState || !Array.isArray(favorites)) {
      return;
    }
    state.sortState.favorites = applyConfiguredHotkeys(favorites, state.sortState.job?.options || {});
  }

  function reorderedFavorites(favoriteIds) {
    const current = state.sortState?.favorites || [];
    const real = realFavorites();
    const byId = new Map(real.map((favorite) => [String(favorite.id), favorite]));
    const ordered = [];
    favoriteIds.forEach((id) => {
      if (byId.has(String(id))) {
        ordered.push(byId.get(String(id)));
        byId.delete(String(id));
      }
    });
    real.forEach((favorite) => {
      if (byId.has(String(favorite.id))) {
        ordered.push(favorite);
      }
    });
    const normalized = ordered.map((favorite, index) => ({
      ...favorite,
      position: index + 1,
      hotkey: hotkeyForPosition(index + 1, state.sortState?.job?.options || {}),
    }));
    return [...normalized, ...current.filter((favorite) => favorite.locked || favorite.id === "skip")];
  }

  function clampIndex(index, images) {
    if (images.length === 0) {
      return 0;
    }
    return Math.max(0, Math.min(images.length - 1, Number.isFinite(index) ? index : 0));
  }

  function currentImage(sortState = state.sortState) {
    const images = sortImages(sortState);
    return images[clampIndex(state.imageIndex, images)] || null;
  }

  function setImageIndex(index) {
    const images = sortImages(state.sortState || mockSortState(state.jobId || 1));
    const nextIndex = clampIndex(index, images);
    if (nextIndex === state.imageIndex) {
      syncImageBuffer();
      persistPositionSoon();
      return;
    }
    state.imageIndex = nextIndex;
    render();
    persistPositionSoon();
  }

  async function moveImage(delta) {
    const images = sortImages(state.sortState || mockSortState(state.jobId || 1));
    const page = pageInfo();
    const nextIndex = state.imageIndex + delta;
    if (nextIndex >= images.length && page.hasNext) {
      await goToImagePage(page.nextCursor, 0);
      return;
    }
    if (nextIndex < 0 && page.hasPrevious) {
      await goToImagePage(page.previousCursor, PAGE_LIMIT - 1);
      return;
    }

    setImageIndex(nextIndex);
  }

  async function goToImagePage(cursor, preferredIndex) {
    if (cursor === null || cursor === undefined) {
      return;
    }
    if (imagePageLoadPromise) {
      await imagePageLoadPromise;
      return;
    }
    imagePageLoadPromise = loadImagePage(Math.max(0, Number(cursor) || 0), preferredIndex)
      .finally(() => {
        imagePageLoadPromise = null;
      });
    await imagePageLoadPromise;
  }

  function completeCurrentDecision(type, label = "") {
    const sortState = state.sortState;
    if (!sortState) {
      return;
    }

    const images = sortImages(sortState);
    if (images.length > 0) {
      images.splice(clampIndex(state.imageIndex, images), 1);
    }
    state.imageIndex = clampIndex(state.imageIndex, images);
    if (type === "skip") {
      sortState.job.skippedFiles = Number(sortState.job.skippedFiles || 0) + 1;
    } else if (type !== "duplicate") {
      sortState.job.sortedFiles = Number(sortState.job.sortedFiles || 0) + 1;
      sortState.job.queuedOperations = Number(sortState.job.queuedOperations || 0) + 1;
    }
    if (sortState.job.status === "draft") {
      sortState.job.status = "sorting";
    }
    clearImagePageCache();
    registerDecisionFeedback(type, label);
    persistPositionSoon();
  }

  async function refillImagesAfterDecision() {
    if (!state.sortState) {
      return;
    }

    if (sortImages(state.sortState).length > 0) {
      prefetchAdjacentImagePages();
      return;
    }

    const page = pageInfo(state.sortState);
    if (page.hasNext && page.nextCursor !== null && page.nextCursor !== undefined) {
      await loadImagePage(page.nextCursor, 0, false, null);
    }
    if (sortImages(state.sortState).length === 0 && Number(page.cursor || 0) > 0) {
      await loadImagePage(0, 0, false, "unsorted");
    }
    prefetchAdjacentImagePages();
  }

  function registerDecisionFeedback(type, label) {
    state.decisionStreak = Math.min(999, Number(state.decisionStreak || 0) + 1);
    state.decisionsThisSession = Math.min(9999, Number(state.decisionsThisSession || 0) + 1);

    const id = Date.now();
    state.feedback = {
      id,
      type,
      label,
      streak: state.decisionStreak,
    };

    if (feedbackTimer) {
      window.clearTimeout(feedbackTimer);
    }
    feedbackTimer = window.setTimeout(() => {
      if (state.feedback?.id === id) {
        state.feedback = null;
        render();
      }
    }, 850);
  }

  function resetSessionFlow() {
    state.feedback = null;
    state.decisionInFlight = false;
    state.decisionSourcePath = null;
    state.decisionStreak = 0;
    state.decisionsThisSession = 0;
    state.sessionStartedAt = Date.now();
    if (feedbackTimer) {
      window.clearTimeout(feedbackTimer);
      feedbackTimer = null;
    }
  }

  function progressStats(job, page, images) {
    const baseline = matchingProgressBaseline(job);
    const rawDone = Number(job.sortedFiles || 0) + Number(job.skippedFiles || 0);
    const done = Math.max(0, rawDone - (baseline ? Number(baseline.sorted || 0) + Number(baseline.skipped || 0) : 0));
    const visibleTotal = Number(page?.total || 0);
    const fallbackTotal = done + Math.max(0, images.length);
    const total = Math.max(visibleTotal, Number(job.totalFiles || 0), fallbackTotal, 1);
    const percent = Math.min(100, Math.round((done / total) * 100));
    return { done, total, percent };
  }

  function setProgressBaseline(job) {
    state.progressBaseline = {
      jobId: Number(job?.id || 0),
      sorted: Number(job?.sortedFiles || 0),
      skipped: Number(job?.skippedFiles || 0),
    };
    root.dataset.progressBaseline = String(state.progressBaseline.sorted + state.progressBaseline.skipped);
  }

  function clearProgressBaseline() {
    state.progressBaseline = null;
    root.dataset.progressBaseline = "0";
  }

  function matchingProgressBaseline(job) {
    const baseline = state.progressBaseline;
    if (!baseline || String(baseline.jobId) !== String(job?.id || "")) {
      return null;
    }
    return baseline;
  }

  function sessionTempo() {
    const minutes = Math.max(0.05, (Date.now() - Number(state.sessionStartedAt || Date.now())) / 60000);
    return Math.round((Number(state.decisionsThisSession || 0) / minutes) * 10) / 10;
  }

  function flowMilestone(percent, streak) {
    if (percent >= 100) {
      return "Flow geschafft";
    }
    if (streak >= 25) {
      return "Sehr starke Serie";
    }
    if (streak >= 10) {
      return "Guter Lauf";
    }
    if (percent >= 75) {
      return "Endspurt";
    }
    if (percent >= 50) {
      return "Halbzeit geschafft";
    }
    if (percent >= 25) {
      return "Rhythmus gefunden";
    }
    return "Bereit für den nächsten Griff";
  }

  function filmstripWindow(images, currentIndex) {
    if (images.length <= THUMB_WINDOW) {
      return { start: 0, items: images };
    }

    const half = Math.floor(THUMB_WINDOW / 2);
    const start = Math.max(0, Math.min(images.length - THUMB_WINDOW, currentIndex - half));
    return { start, items: images.slice(start, start + THUMB_WINDOW) };
  }

  function planImageBuffer(images, currentIndex) {
    const radius = activePreloadRadius();
    const first = Math.max(0, currentIndex - radius);
    const last = Math.min(images.length - 1, currentIndex + radius);
    state.bufferPlan = [];
    for (let index = first; index <= last; index += 1) {
      state.bufferPlan.push(index);
    }
    return state.bufferPlan;
  }

  function activePreloadRadius() {
    const mode = state.sortState?.job?.options?.preloadMode || state.jobDraft.preloadMode || "balanced";
    if (mode === "turbo") {
      return 8;
    }
    if (mode === "light") {
      return 2;
    }
    return DEFAULT_PRELOAD_RADIUS;
  }

  function syncImageBuffer() {
    if (state.page !== "sort") {
      clearImageBuffer();
      return;
    }

    const images = sortImages(state.sortState || mockSortState(state.jobId || 1));
    const indexes = planImageBuffer(images, clampIndex(state.imageIndex, images));
    const keepKeys = new Set();
    indexes.forEach((index) => {
      const image = images[index];
      const key = imageKey(image, index);
      keepKeys.add(key);
      preloadImage(image, key);
    });

    Array.from(imageBuffer.keys()).forEach((key) => {
      if (!keepKeys.has(key) || imageBuffer.size > MAX_BUFFERED_IMAGES) {
        deleteBufferedImage(key);
      }
    });
    root.dataset.bufferedImages = String(imageBuffer.size);
    root.dataset.bufferPlan = String(state.bufferPlan.length);
    prefetchAdjacentImagePages();
  }

  function preloadImage(image, key) {
    const url = imageUrl(image);
    if (!url || imageBuffer.has(key) || typeof window.Image !== "function") {
      return;
    }

    const loader = new window.Image();
    loader.decoding = "async";
    const entry = { status: "loading", url, loader };
    imageBuffer.set(key, entry);
    loader.onload = () => {
      entry.status = "ready";
    };
    loader.onerror = () => {
      entry.status = "failed";
    };
    loader.src = url;
    if (typeof loader.decode === "function") {
      loader.decode().then(() => {
        entry.status = "ready";
      }).catch(() => {
        entry.status = "failed";
      });
    }
  }

  function deleteBufferedImage(key) {
    const entry = imageBuffer.get(key);
    if (!entry) {
      return;
    }
    releaseBufferedImage(entry);
    imageBuffer.delete(key);
  }

  function clearImageBuffer() {
    Array.from(imageBuffer.keys()).forEach(deleteBufferedImage);
    root.dataset.bufferedImages = "0";
    root.dataset.bufferPlan = "0";
  }

  function releaseBufferedImage(entry) {
    const loader = entry?.loader;
    if (!loader) {
      return;
    }
    loader.onload = null;
    loader.onerror = null;
    try {
      loader.removeAttribute("src");
    } catch (error) {
      loader.src = "";
    }
  }

  function imageKey(image, index) {
    return String(image?.fileId || image?.path || image?.name || index);
  }

  function imageUrl(image) {
    return image?.previewUrl || image?.thumbnailUrl || image?.url || "";
  }

  function photoDisplayUrl(image) {
    return image?.previewUrl || image?.downloadUrl || image?.url || image?.thumbnailUrl || "";
  }

  function prefetchAdjacentImagePages() {
    if (state.page !== "sort" || !state.jobId || !state.sortState) {
      root.dataset.pageCacheSize = String(imagePageCache.size);
      root.dataset.pagePrefetchPending = String(imagePagePrefetches.size);
      return;
    }

    const images = sortImages(state.sortState);
    const page = pageInfo(state.sortState);
    const radius = activePreloadRadius() + 2;
    if (page.hasNext && state.imageIndex >= Math.max(0, images.length - radius)) {
      prefetchImagePage(page.nextCursor);
    }
    if (page.hasPrevious && state.imageIndex <= radius) {
      prefetchImagePage(page.previousCursor);
    }

    root.dataset.pageCacheSize = String(imagePageCache.size);
    root.dataset.pagePrefetchPending = String(imagePagePrefetches.size);
  }

  function prefetchImagePage(cursor) {
    if (cursor === null || cursor === undefined || !state.jobId) {
      return;
    }
    const numericCursor = Math.max(0, Number(cursor) || 0);
    const key = imagePageCacheKey(state.jobId, numericCursor);
    if (imagePageCache.has(key) || imagePagePrefetches.has(key)) {
      return;
    }

    const params = new URLSearchParams({ limit: String(PAGE_LIMIT), cursor: String(numericCursor) });
    const generation = imagePageCacheGeneration;
    const promise = request(`/api/v1/jobs/${state.jobId}/sort-state?${params.toString()}`)
      .then((payload) => {
        if (generation !== imagePageCacheGeneration) {
          return;
        }
        rememberImagePage(payload);
        preloadFirstPageImages(payload);
      })
      .catch(() => {})
      .finally(() => {
        if (generation === imagePageCacheGeneration) {
          imagePagePrefetches.delete(key);
        }
        root.dataset.pageCacheSize = String(imagePageCache.size);
        root.dataset.pagePrefetchPending = String(imagePagePrefetches.size);
      });
    imagePagePrefetches.set(key, promise);
    root.dataset.pagePrefetchPending = String(imagePagePrefetches.size);
  }

  function preloadFirstPageImages(payload) {
    const images = Array.isArray(payload?.nextImages) ? payload.nextImages : [];
    const radius = activePreloadRadius();
    images.slice(0, radius).forEach((image, index) => {
      preloadImage(image, imageKey(image, index));
    });
  }

  function rememberImagePage(payload) {
    const cursor = Number(payload?.imagePage?.cursor ?? Number.NaN);
    const jobId = Number(payload?.job?.id || state.jobId || 0);
    if (!Number.isFinite(cursor) || jobId <= 0) {
      return;
    }
    imagePageCache.set(imagePageCacheKey(jobId, cursor), payload);
    while (imagePageCache.size > 5) {
      imagePageCache.delete(imagePageCache.keys().next().value);
    }
    root.dataset.pageCacheSize = String(imagePageCache.size);
  }

  function clearImagePageCache() {
    imagePageCacheGeneration += 1;
    imagePageCache.clear();
    imagePagePrefetches.clear();
    root.dataset.pageCacheSize = "0";
    root.dataset.pagePrefetchPending = "0";
    root.dataset.pageCacheHit = "0";
  }

  function imagePageCacheKey(jobId, cursor) {
    return `${jobId}:${Math.max(0, Number(cursor) || 0)}`;
  }

  function mergeSortPayload(payload) {
    const previousJob = state.sortState?.job;
    if (state.acceptDecreasedCounters) {
      state.acceptDecreasedCounters = false;
      return payload;
    }
    if (!previousJob || !payload?.job || String(previousJob.id) !== String(payload.job.id)) {
      return payload;
    }

    return {
      ...payload,
      job: {
        ...payload.job,
        status: previousJob.status || payload.job.status,
        sortedFiles: Math.max(Number(payload.job.sortedFiles || 0), Number(previousJob.sortedFiles || 0)),
        skippedFiles: Math.max(Number(payload.job.skippedFiles || 0), Number(previousJob.skippedFiles || 0)),
        queuedOperations: Math.max(Number(payload.job.queuedOperations || 0), Number(previousJob.queuedOperations || 0)),
        executedOperations: Math.max(Number(payload.job.executedOperations || 0), Number(previousJob.executedOperations || 0)),
        failedOperations: Math.max(Number(payload.job.failedOperations || 0), Number(previousJob.failedOperations || 0)),
      },
    };
  }

  function pageInfo(sortState = state.sortState) {
    return sortState?.imagePage || state.imagePage || defaultImagePage(sortImages(sortState));
  }

  function defaultImagePage(images) {
    return {
      cursor: 0,
      limit: PAGE_LIMIT,
      total: images.length,
      returned: images.length,
      hasPrevious: false,
      previousCursor: null,
      hasNext: false,
      nextCursor: null,
      mode: "local",
    };
  }

  function persistPositionSoon() {
    if (state.page !== "sort" || !state.jobId || !state.sortState) {
      return;
    }
    if (positionSaveTimer) {
      window.clearTimeout(positionSaveTimer);
    }
    positionSaveTimer = window.setTimeout(() => {
      savePosition().catch(() => {});
    }, 350);
  }

  async function savePosition() {
    const page = pageInfo();
    const current = currentImage();
    await request(`/api/v1/jobs/${state.jobId}/position`, {
      method: "POST",
      body: {
        cursor: Number(page.cursor || 0),
        index: state.imageIndex,
        fileId: current?.fileId || null,
      },
    });
  }

  function summarizeJobs(jobs) {
    return jobs.reduce(
      (summary, job) => {
        const queuedOperations = Number(job.queuedOperations || 0);
        const released = job.status === "queued" ? queuedOperations : 0;
        return {
          jobs: summary.jobs + 1,
          sorted: summary.sorted + Number(job.sortedFiles || 0),
          planned: summary.planned + Math.max(0, queuedOperations - released),
          queued: summary.queued + released,
          failed: summary.failed + Number(job.failedOperations || 0),
        };
      },
      { jobs: 0, sorted: 0, planned: 0, queued: 0, failed: 0 },
    );
  }

  function modeLabel(mode) {
    return {
      album: "Album",
      move: "Verschieben",
      copy: "Kopieren",
    }[mode] || escapeHtml(mode || "");
  }

  function statusLabel(status) {
    return {
      draft: "Entwurf",
      sorting: "In Arbeit",
      paused: "Pausiert",
      ready: "Bereit",
      queued: "Wartet auf Ablage",
      executing: "Wird abgelegt",
      done: "Abgeschlossen",
      error: "Fehler",
    }[status] || escapeHtml(status || "");
  }

  function statusClass(status) {
    return {
      draft: "safe",
      sorting: "ready",
      paused: "",
      ready: "ready",
      queued: "ready",
      executing: "warning",
      done: "safe",
      error: "danger",
    }[status] || "";
  }

  function targetOrderingLabel(ordering) {
    return ordering === "alphabetical" ? "Alphabetisch" : "Passende Ziele zuerst";
  }

  function readinessLabel(readiness) {
    return {
      ready: "Bereit",
      warning: "Warnung",
      error: "Fehler",
    }[readiness] || "Unklar";
  }

  function executionModeLabel(mode) {
    return mode === "real-writes-enabled" ? "Dateiänderungen aktiv" : "Dateiänderungen gesperrt";
  }

  function backgroundModeLabel(mode) {
    return {
      "cron-enabled": "Automatik aktiv",
      "cron-ready": "Automatik bereit",
      "cron-waiting": "Wartet auf Ruhe",
      "manual-only": "Manuell",
    }[mode] || "Manuell";
  }

  function executionModeClass(mode) {
    return mode === "real-writes-enabled" ? "danger" : "safe";
  }

  function backgroundModeClass(mode) {
    if (mode === "cron-ready" || mode === "cron-enabled") {
      return "ready";
    }
    if (mode === "cron-waiting") {
      return "warning";
    }
    return "safe";
  }

  function beginStartHint(job) {
    if (Number(job?.executedOperations || 0) > 0) {
      return "Startet nur die Ansicht beim ersten Bild. Bereits abgelegte Dateien werden nicht zurückgeholt.";
    }
    return "Startet die Ansicht beim ersten Bild. Vorgemerkte Ablagen bleiben erhalten.";
  }

  function queueStatusLabel(status) {
    return {
      planned: "Geplant",
      queued: "Wartet",
      executing: "In Arbeit",
      executed: "Erledigt",
      blocked: "Blockiert",
      failed: "Fehler",
    }[status] || status || "";
  }

  function formatTime(timestamp) {
    const value = Number(timestamp || 0);
    if (!value) {
      return "";
    }
    try {
      return new Date(value * 1000).toLocaleString();
    } catch (error) {
      return String(value);
    }
  }

  function formatShortTime(timestamp) {
    const value = Number(timestamp || 0);
    if (!value) {
      return "gerade";
    }
    try {
      return new Date(value * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch (error) {
      return String(value);
    }
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function escapeAttr(value) {
    return escapeHtml(value);
  }

  load();
})();
