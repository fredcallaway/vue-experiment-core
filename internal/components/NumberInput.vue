  <template>
  <input 
    v-model.number="inputValue"
    @change="confirm"
    @wheel="scrollHandler"
    :class="{'border-red-500': invalid}"

  />
</template>

<script setup lang="ts">


const props = withDefaults(defineProps<{
  modelValue: number
  scrollStep?: number
  min?: number
  max?: number
  currency?: 'cents' | 'dollars'
}>(), {
  scrollStep: 1,
  min: -Infinity,
  max: Infinity
})

const emit = defineEmits<{
  'update:modelValue': [value: number]
}>()

const inputValue = ref(props.modelValue)
const invalid = computed(() => !isBetween(inputValue.value, props.min, props.max) || isNaN(inputValue.value))

const confirm = () => {
  if (isNaN(inputValue.value)) {
    inputValue.value = props.modelValue
  } else {
    inputValue.value = clamp(inputValue.value, props.min, props.max)
    emit('update:modelValue', inputValue.value)
  }
}

const scrollHandler = useScrollHandler((direction) => {
  inputValue.value += props.scrollStep * direction
  confirm()
})

</script>

