<script setup lang="ts">
interface Props {
  modelValue?: boolean
  onText?: string
  offText?: string
  onHtml?: string
  offHtml?: string
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: false,
  onText: undefined,
  offText: undefined,
  onHtml: undefined,
  offHtml: undefined,
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const isActive = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
})
</script>

<template>
  <label class="swap cursor-pointer">
    <input
      type="checkbox"
      v-model="isActive"
      class="hidden"
    />
    <div class="swap-on">
      <slot name="on">
        <span v-if="onHtml" v-html="onHtml" />
        <span v-else-if="onText" class="underline text-gray hover:text-blue">{{ onText }}</span>
      </slot>
    </div>
    <div class="swap-off">
      <slot name="off">
        <span v-if="offHtml" v-html="offHtml" />
        <span v-else-if="offText" class="underline text-gray hover:text-blue">{{ offText }}</span>
      </slot>
    </div>
  </label>
</template>

<style scoped>
.swap {
  display: inline-flex;
  align-items: center;
  position: relative;
}

.swap-on,
.swap-off {
  display: block;
}

input:checked ~ .swap-on {
  display: block;
}

input:checked ~ .swap-off {
  display: none;
}

input:not(:checked) ~ .swap-on {
  display: none;
}

input:not(:checked) ~ .swap-off {
  display: block;
}
</style>

