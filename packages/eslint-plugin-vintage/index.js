'use strict';

// React Native pressable components. If a JSX opening element uses one of
// these names AND has no onPress/onPressIn/onPressOut/onLongPress/disabled
// attribute (or a spread that could forward one), the element is almost
// certainly a decorative button — which is exactly the class of bug that
// shipped "Impulsionar anuncio" with three untappable plan cards.
const PRESSABLE_NAMES = new Set([
  'TouchableOpacity',
  'TouchableHighlight',
  'TouchableWithoutFeedback',
  'TouchableNativeFeedback',
  'Pressable',
]);

// Any of these attributes means the element is interactive on purpose.
// `disabled` opts out (intentionally inert, e.g. form submit gating).
// `accessibilityRole="image"` opts out (semantic wrapper).
const INTERACTIVITY_ATTRS = new Set([
  'onPress',
  'onPressIn',
  'onPressOut',
  'onLongPress',
  'onHoverIn',
  'onHoverOut',
  'disabled',
]);

const noNonfunctionalTouchable = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Flag pressable React Native elements that have no onPress (or equivalent) — prevents decorative buttons from shipping.',
    },
    schema: [],
    messages: {
      missingOnPress:
        '<{{name}}> has no onPress/onLongPress/disabled. If this is interactive, add an onPress handler; if it is purely decorative, use <View> instead.',
    },
  },
  create(context) {
    return {
      JSXOpeningElement(node) {
        if (node.name.type !== 'JSXIdentifier') return;
        const name = node.name.name;
        if (!PRESSABLE_NAMES.has(name)) return;

        let hasInteractivity = false;
        let hasSpread = false;
        let ignoredViaAccessibility = false;

        for (const attr of node.attributes) {
          if (attr.type === 'JSXSpreadAttribute') {
            hasSpread = true;
            continue;
          }
          if (attr.type !== 'JSXAttribute' || attr.name.type !== 'JSXIdentifier') {
            continue;
          }
          const attrName = attr.name.name;
          if (INTERACTIVITY_ATTRS.has(attrName)) {
            hasInteractivity = true;
            break;
          }
          if (
            attrName === 'accessibilityRole' &&
            attr.value &&
            attr.value.type === 'Literal' &&
            attr.value.value === 'image'
          ) {
            ignoredViaAccessibility = true;
          }
        }

        // Spread attributes could be forwarding an onPress, so we can't
        // be sure — stay silent rather than false-positive.
        if (hasInteractivity || hasSpread || ignoredViaAccessibility) return;

        context.report({
          node: node.name,
          messageId: 'missingOnPress',
          data: { name },
        });
      },
    };
  },
};

module.exports = {
  rules: {
    'no-nonfunctional-touchable': noNonfunctionalTouchable,
  },
};
