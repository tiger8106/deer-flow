/** Presentation-only filtering: retain original messages for the agent and history. */
export function isInternalToolCall(call: {
  name: string;
  args?: Record<string, unknown>;
}) {
  if (
    [
      "bash",
      "write_file",
      "str_replace",
      "edit_file",
      "ls",
      "skill_manage",
      "tool_search",
      "review_skill_package",
      "setup_agent",
      "update_agent",
    ].includes(call.name)
  )
    return true;
  const value = call.args?.path ?? call.args?.file_path;
  const path = typeof value === "string" ? value : "";
  return (
    call.name === "read_file" &&
    /(?:\/skills\/|SKILL\.md|AGENTS\.md|\.(?:py|tsx?|sh)$)/i.test(path)
  );
}

export function visibleProcessingText(text: string, streaming = false): string {
  // Hold an unfinished paragraph so a streamed technical instruction cannot flash
  // before its identifying path/command arrives in a later chunk.
  const complete = streaming
    ? text.slice(0, Math.max(0, text.lastIndexOf("\n\n")))
    : text;
  return complete
    .replace(/```[\s\S]*?(?:```|$)/g, "")
    .split(/\n\s*\n/)
    .filter(
      (paragraph) =>
        !/```|`|(?:\/mnt\/|\/app\/|SKILL\.md|AGENTS\.md)|(?:tool_calls?|tool_choice|build_ppt|finish_ppt|python|typescript|javascript|JSON schema|OOXML|deck\.json)|(?:工具参数|工具调用|系统提示|技能文档|智能体技术|内部实现|调用工具|运行脚本|执行命令|参数格式|上下文窗口|模型接口|思考预算)/i.test(
          paragraph,
        ),
    )
    .join("\n\n");
}
