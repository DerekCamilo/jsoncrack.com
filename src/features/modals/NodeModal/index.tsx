import React, { useState } from "react";
import type { ModalProps } from "@mantine/core";
import { Modal, Stack, Text, ScrollArea, Flex, CloseButton, Button, Group, Textarea } from "@mantine/core";
import { CodeHighlight } from "@mantine/code-highlight";
import { toast } from "react-hot-toast";
import type { Node } from "jsonc-parser";
import type { NodeData } from "../../../types/graph";
import useGraph from "../../editor/views/GraphView/stores/useGraph";
import useJson from "../../../store/useJson";
import useFile from "../../../store/useFile";

// return object from json removing array and object fields
const normalizeNodeData = (nodeRows: NodeData["text"]) => {
  if (!nodeRows || nodeRows.length === 0) return "{}";
  if (nodeRows.length === 1 && !nodeRows[0].key) return `${nodeRows[0].value}`;

  const obj = {};
  nodeRows?.forEach(row => {
    if (row.type !== "array" && row.type !== "object") {
      if (row.key) obj[row.key] = row.value;
    }
  });
  return JSON.stringify(obj, null, 2);
};

// return json path in the format $["customer"]
const jsonPathToString = (path?: NodeData["path"]) => {
  if (!path || path.length === 0) return "$";
  const segments = path.map(seg => (typeof seg === "number" ? seg : `"${seg}"`));
  return `$[${segments.join("][")}]`;
};

export const NodeModal = ({ opened, onClose }: ModalProps) => {
  const nodeData = useGraph(state => state.selectedNode);
  const [isEditing, setIsEditing] = useState(false);
  const [formValues, setFormValues] = useState<Record<string, any>>({});

  const initFormValues = () => {
    const initial: Record<string, any> = {};
    nodeData?.text?.forEach(row => {
      if (row.key) {
        if (row.type === "boolean") initial[row.key] = Boolean(row.value);
        else if (row.type === "number") initial[row.key] = row.value;
        else initial[row.key] = row.value;
      } else {
        initial["__value__"] = row.value;
      }
    });
    setFormValues(initial);
  };

  const handleEdit = () => {
    initFormValues();
    setIsEditing(true);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setFormValues({});
  };

  const handleSave = () => {
    if (!nodeData) return;
    try {
      const originalStr = useJson.getState().getJson();
      const original = JSON.parse(originalStr);
      const path = nodeData.path ?? [];

      const getParentAndKey = (obj: any, p: (string | number)[]) => {
        if (!p || p.length === 0) return { parent: null, key: null };
        const last = p[p.length - 1];
        const parentPath = p.slice(0, -1);
        let parent = obj;
        for (const seg of parentPath) parent = parent?.[seg as any];
        return { parent, key: last };
      };

      if (nodeData.text.length === 1 && !nodeData.text[0].key) {
        // primitive value
        const valueRaw = formValues["__value__"] ?? nodeData.text[0].value;
        let newValue: any = valueRaw;
        const origType = nodeData.text[0].type;
        if (origType === "number") newValue = Number(valueRaw);
        if (origType === "boolean") newValue = valueRaw === true || valueRaw === "true";

        if (!path || path.length === 0) {
          useFile.getState().setContents({ contents: JSON.stringify(newValue, null, 2), hasChanges: true });
        } else {
          const { parent, key } = getParentAndKey(original, path);
          if (parent && key !== null) {
            parent[key as any] = newValue;
            useFile.getState().setContents({ contents: JSON.stringify(original, null, 2), hasChanges: true });
          }
        }
      } else {
        // object node: update child keys
        let target: any = original;
        for (const seg of path) target = target?.[seg as any];
        if (target && typeof target === "object") {
          Object.keys(formValues).forEach(k => {
            const row = nodeData.text.find(r => r.key === k);
            if (!row) return;
            const v = formValues[k];
            if (row.type === "number") target[k] = Number(v);
            else if (row.type === "boolean") target[k] = v === true || v === "true";
            else target[k] = v;
          });
          useFile.getState().setContents({ contents: JSON.stringify(original, null, 2), hasChanges: true });
        }
      }

      setIsEditing(false);
      onClose();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Failed to apply edit to JSON", err);
      toast.error("Failed to apply edit");
    }
  };

  return (
    <Modal size="auto" opened={opened} onClose={onClose} centered withCloseButton={false}>
      <Stack pb="sm" gap="sm">
        <Stack gap="xs">
          <Flex justify="space-between" align="center">
            <Text fz="xs" fw={500}>
              Content
            </Text>
            <CloseButton onClick={onClose} />
          </Flex>
          <ScrollArea.Autosize mah={250} maw={600}>
            {isEditing ? (
              <div>
                {nodeData?.text && nodeData.text.length > 0 ? (
                  nodeData.text.map((row, idx) => {
                    const key = row.key ?? (nodeData.text.length === 1 ? "__value__" : `row_${idx}`);
                    const value = formValues[key] ?? row.value ?? "";

                    if (row.key || nodeData.text.length === 1) {
                      if (row.type === "boolean") {
                        return (
                          <Flex key={key} align="center" gap="sm" style={{ marginBottom: 8 }}>
                            <Text fz="xs" style={{ width: 120 }}>
                              {row.key ?? "value"}
                            </Text>
                            <input
                              type="checkbox"
                              checked={Boolean(value)}
                              onChange={e => setFormValues(prev => ({ ...prev, [key]: e.currentTarget.checked }))}
                            />
                          </Flex>
                        );
                      }

                      if (row.type === "number") {
                        return (
                          <Flex key={key} align="center" gap="sm" style={{ marginBottom: 8 }}>
                            <Text fz="xs" style={{ width: 120 }}>
                              {row.key ?? "value"}
                            </Text>
                            <input
                              type="number"
                              value={value}
                              onChange={e => setFormValues(prev => ({ ...prev, [key]: e.currentTarget.value }))}
                              style={{ flex: 1, padding: 6 }}
                            />
                          </Flex>
                        );
                      }

                      return (
                        <Flex key={key} align="center" gap="sm" style={{ marginBottom: 8 }}>
                          <Text fz="xs" style={{ width: 120 }}>
                            {row.key ?? "value"}
                          </Text>
                          <input
                            type="text"
                            value={value}
                            onChange={e => setFormValues(prev => ({ ...prev, [key]: e.currentTarget.value }))}
                            style={{ flex: 1, padding: 6 }}
                          />
                        </Flex>
                      );
                    }

                    return (
                      <Flex key={key} align="center" gap="sm" style={{ marginBottom: 8 }}>
                        <Text fz="xs" style={{ width: 120 }}>
                          {row.key ?? `row_${idx}`}
                        </Text>
                        <Text fz="xs">{normalizeNodeData([row])}</Text>
                      </Flex>
                    );
                  })
                ) : (
                  <Text fz="xs">No editable values</Text>
                )}
              </div>
            ) : (
              <CodeHighlight
                code={normalizeNodeData(nodeData?.text ?? [])}
                miw={350}
                maw={600}
                language="json"
                withCopyButton
              />
            )}
          </ScrollArea.Autosize>
          <Group justify="flex-end">
            {!isEditing ? (
              <Button size="xs" onClick={handleEdit}>
                Edit
              </Button>
            ) : (
              <>
                <Button size="xs" color="red" onClick={handleCancel}>
                  Cancel
                </Button>
                <Button size="xs" color="green" onClick={handleSave}>
                  Save
                </Button>
              </>
            )}
          </Group>
        </Stack>
        <Text fz="xs" fw={500}>
          JSON Path
        </Text>
        <ScrollArea.Autosize maw={600}>
          <CodeHighlight
            code={jsonPathToString(nodeData?.path)}
            miw={350}
            mah={250}
            language="json"
            copyLabel="Copy to clipboard"
            copiedLabel="Copied to clipboard"
            withCopyButton
          />
        </ScrollArea.Autosize>
      </Stack>
    </Modal>
  );
};