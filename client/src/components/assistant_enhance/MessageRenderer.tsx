import { Box, Typography } from "@mui/material";
import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { chatUi } from "../../lib/chatAssistantTheme";

const bodyFont = "inherit";

/** Normalize markdown before render — ensure headings, lists, and tables have blank lines. */
function normalizeMarkdown(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/([^\n])\n(#{1,3} )/g, "$1\n\n$2")
    .replace(/([^\n])\n([-*] )/g, "$1\n\n$2")
    .replace(/([^\n])\n(\d+\. )/g, "$1\n\n$2")
    .replace(/([^\n])\n(\|[^\n|]+\|)/g, "$1\n\n$2")
    .trim();
}

const metricStrongSx = {
  fontWeight: 700,
  color: chatUi.primary,
};

const markdownComponents: Components = {
  h1: ({ children }) => (
    <Typography component="h1" sx={{ fontSize: "1.0625rem", fontWeight: 800, color: chatUi.text, mt: 1.5, mb: 0.5, lineHeight: 1.3, "&:first-of-type": { mt: 0 } }}>
      {children}
    </Typography>
  ),
  h2: ({ children }) => (
    <Typography component="h2" sx={{ fontSize: "1rem", fontWeight: 700, color: chatUi.text, mt: 1.25, mb: 0.5, lineHeight: 1.3, "&:first-of-type": { mt: 0 } }}>
      {children}
    </Typography>
  ),
  h3: ({ children }) => (
    <Typography component="h3" sx={{ fontSize: "0.875rem", fontWeight: 600, color: chatUi.textSecondary, mt: 1, mb: 0.25, lineHeight: 1.3 }}>
      {children}
    </Typography>
  ),
  p: ({ children }) => (
    <Typography component="p" sx={{ fontSize: "inherit", lineHeight: "inherit", color: "inherit" }}>
      {children}
    </Typography>
  ),
  strong: ({ children }) => (
    <Box component="strong" sx={metricStrongSx}>
      {children}
    </Box>
  ),
  table: ({ children }) => (
    <Box
      sx={{
        width: "100%",
        maxWidth: "100%",
        overflowX: "auto",
        mb: 1.5,
        borderRadius: chatUi.radiusSm,
        border: chatUi.borderSubtle,
        bgcolor: "rgba(0,0,0,0.15)",
      }}
    >
      <Box
        component="table"
        sx={{
          width: "100%",
          borderCollapse: "collapse",
          fontFamily: bodyFont,
          fontSize: "0.875rem",
          tableLayout: "auto",
        }}
      >
        {children}
      </Box>
    </Box>
  ),
  thead: ({ children }) => <Box component="thead">{children}</Box>,
  tbody: ({ children }) => <Box component="tbody">{children}</Box>,
  tr: ({ children }) => <Box component="tr">{children}</Box>,
  th: ({ children }) => (
    <Box
      component="th"
      sx={{
        textAlign: "left",
        fontWeight: 600,
        color: chatUi.text,
        bgcolor: "rgba(59, 130, 246, 0.12)",
        borderBottom: chatUi.borderSubtle,
        px: 1.25,
        py: 0.85,
        whiteSpace: "normal",
        wordBreak: "break-word",
      }}
    >
      {children}
    </Box>
  ),
  td: ({ children }) => (
    <Box
      component="td"
      sx={{
        borderBottom: "1px solid rgba(148, 163, 184, 0.12)",
        color: chatUi.textSecondary,
        px: 1.25,
        py: 0.85,
        whiteSpace: "normal",
        wordBreak: "break-word",
        verticalAlign: "top",
        "& strong": metricStrongSx,
      }}
    >
      {children}
    </Box>
  ),
  blockquote: ({ children }) => (
    <Box
      component="blockquote"
      sx={{
        m: 0,
        mb: 1.5,
        pl: 1.5,
        borderLeft: `3px solid ${chatUi.primary}`,
        color: chatUi.textSecondary,
        fontStyle: "italic",
        overflowWrap: "anywhere",
        wordBreak: "break-word",
      }}
    >
      {children}
    </Box>
  ),
  ul: ({ children }) => (
    <Box component="ul" sx={{ pl: 2.5, mb: 1.5, mt: 0, overflowWrap: "anywhere" }}>
      {children}
    </Box>
  ),
  ol: ({ children }) => (
    <Box component="ol" sx={{ pl: 2.5, mb: 1.5, mt: 0, overflowWrap: "anywhere" }}>
      {children}
    </Box>
  ),
  li: ({ children }) => (
    <Box component="li" sx={{ mb: 0.5, overflowWrap: "anywhere", wordBreak: "break-word" }}>
      {children}
    </Box>
  ),
  pre: ({ children }) => (
    <Box
      component="pre"
      sx={{
        m: 0,
        mb: 1.5,
        p: 1.25,
        borderRadius: chatUi.radiusSm,
        bgcolor: "rgba(0,0,0,0.2)",
        overflowX: "auto",
        overflowWrap: "anywhere",
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        fontFamily: bodyFont,
        fontSize: "0.875rem",
        lineHeight: 1.55,
        maxWidth: "100%",
      }}
    >
      {children}
    </Box>
  ),
  code: ({ className, children }) => {
    const isBlock = Boolean(className);
    if (isBlock) {
      return (
        <Box component="code" sx={{ fontFamily: bodyFont, fontSize: "inherit", bgcolor: "transparent", p: 0 }}>
          {children}
        </Box>
      );
    }
    return (
      <Box
        component="code"
        sx={{
          bgcolor: "rgba(0,0,0,0.25)",
          px: 0.5,
          py: 0.15,
          borderRadius: "4px",
          fontFamily: bodyFont,
          fontSize: "0.9em",
        }}
      >
        {children}
      </Box>
    );
  },
};

export function MessageRenderer({ text, isUser }: { text: string; isUser: boolean }) {
  if (isUser) {
    return (
      <Typography
        sx={{
          fontSize: "0.9375rem",
          lineHeight: 1.55,
          whiteSpace: "pre-wrap",
          color: chatUi.text,
          overflowWrap: "anywhere",
          wordBreak: "break-word",
        }}
      >
        {text}
      </Typography>
    );
  }

  const content = normalizeMarkdown(text);

  return (
    <Box
      sx={{
        color: chatUi.text,
        fontSize: "0.9375rem",
        lineHeight: 1.6,
        fontFamily: bodyFont,
        maxWidth: "100%",
        overflowWrap: "anywhere",
        wordBreak: "break-word",
        "& > *:first-of-type": { mt: 0 },
        "& > *:last-of-type": { mb: 0 },
        "& strong": metricStrongSx,
      }}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {content}
      </ReactMarkdown>
    </Box>
  );
}
